import { homedir } from "node:os";

import {
  createRefreshInvalidationController,
  describeApplicationLayer,
  routeLogEvents,
} from "./application/index.js";
import { createExtensionComposition } from "./extension-composition.js";
import {
  createRuntimeSession,
  createRuntimeSessionCommandHandlers,
} from "./extension-runtime-session.js";
import {
  FileSystemTransferAuditStore,
  createVsCodeOutputChannelLogger,
  createVsCodeRepositoryOpener,
  createVsCodeSettingsReader,
  createVsCodeSettingsWriter,
  describeInfrastructureLayer,
  readVsCodeWorkspaceRoots,
} from "./infrastructure/index.js";
import {
  createCommandHandlers,
  createGlobalSkillsWebviewProvider,
  createSkillsTreeDataProviders,
  describePresentationLayer,
  refreshSponzeyTreeDataProviders,
  registerSponzeyCommands,
  registerSponzeyTreeDataProviders,
  resolveDiagnosticActionCommand,
  wrapCommandHandlerWithResultRendering,
  wrapCommandHandlersWithInputCollection,
} from "./presentation/index.js";

export async function activate(context, runtime = {}) {
  const vscodeApi = runtime.vscodeApi ?? (await loadVscodeApi());
  const commandsApi = runtime.commandsApi ?? vscodeApi?.commands;
  const adapters = createAdapters({ runtime, vscodeApi });
  const defaultMainRepositoryPath =
    runtime.defaultMainRepositoryPath ?? createDefaultMainRepositoryPath();
  const defaultGlobalTargets =
    runtime.defaultGlobalTargets ??
    (runtime.settingsReader || runtime.adapters?.targetStore
      ? []
      : createDefaultGlobalTargets());
  const composition = await createComposition({
    runtime,
    vscodeApi,
    adapters,
    standardGlobalTargets: defaultGlobalTargets,
  });
  const runtimeSession = createRuntimeSession({
    initialComposition: composition,
    compose: () =>
      createComposition({
        runtime,
        vscodeApi,
        adapters,
        standardGlobalTargets: defaultGlobalTargets,
      }),
  });
  const handlers =
    composition?.commandHandlers
      ? createRuntimeSessionCommandHandlers({
          session: runtimeSession,
          fallbackHandlers: createCommandHandlers(runtime.handlers),
        })
      : createCommandHandlers(runtime.handlers);
  const inputReadModelLoader = composition
    ? createTreeReadModelLoader({ runtimeSession })
    : null;
  const inputWindow = selectInputWindow({ runtime, vscodeApi });
  const handlersWithInputCollection = inputWindow
    ? wrapCommandHandlersWithInputCollection({
        handlers,
        window: inputWindow,
        loadReadModel: inputReadModelLoader,
        defaultGlobalTargets,
      })
    : handlers;
  const treeDataProviders = createTreeDataProviders({
    runtimeSession,
    vscodeApi,
    extensionUri: context?.extensionUri,
  });
  const handlersWithRefreshUpdates = treeDataProviders
    ? wrapRefreshHandlerWithTreeDataProviderUpdate({
        handlers: handlersWithInputCollection,
        providers: treeDataProviders,
      })
    : handlersWithInputCollection;
  const watcherLifecycle = createRefreshWatcherLifecycle({
    runtimeSession,
    providers: treeDataProviders,
    vscodeApi,
    logger: adapters.logger,
  });
  const handlersWithTreeUpdates = wrapRuntimeMutationHandlers({
    handlers: handlersWithRefreshUpdates,
    runtimeSession,
    providers: treeDataProviders,
    watcherLifecycle,
    defaultMainRepositoryPath,
    defaultGlobalTargets,
  });
  const handlersWithDiagnosticActions = wrapDiagnosticActionHandlers({
    handlers: handlersWithTreeUpdates,
  });
  const handlersWithLogging = wrapCommandHandlersWithLogging({
    handlers: wrapCommandHandlersWithAudit({
      handlers: handlersWithDiagnosticActions,
      auditStore: adapters.auditStore,
      runtimeSession,
    }),
    logger: adapters.logger,
  });
  const rendererWindow = selectRendererWindow({ runtime, vscodeApi });
  const handlersForRegistration = rendererWindow
    ? wrapCommandHandlersWithResultRendering({
        handlers: handlersWithLogging,
        window: rendererWindow,
      })
    : handlersWithLogging;
  if (
    treeDataProviders &&
    inputReadModelLoader &&
    typeof vscodeApi?.window?.registerWebviewViewProvider === "function"
  ) {
    treeDataProviders["sponzeySkills.globalSkills"] = createGlobalSkillsWebviewProvider({
      loadReadModel: inputReadModelLoader,
      onRemoveEnrollment: (input) => handlersForRegistration["sponzeySkills.removeGlobalSkillEnrollment"](input),
      vscodeApi,
      extensionUri: context?.extensionUri,
    });
  }
  const disposables = commandsApi
    ? registerSponzeyCommands({
        commandsApi,
        handlers: handlersForRegistration,
      })
    : [];
  const treeDataProviderDisposables = registerTreeDataProviders({
    providers: treeDataProviders,
    vscodeApi,
  });
  const watcherDisposables = watcherLifecycle.start();

  if (context?.subscriptions) {
    context.subscriptions.push(
      ...disposables,
      ...treeDataProviderDisposables,
      ...(watcherDisposables.length > 0 ? [watcherLifecycle] : []),
    );
  }

  return {
    application: describeApplicationLayer(),
    infrastructure: describeInfrastructureLayer(),
    presentation: describePresentationLayer(),
    registeredCommandCount: disposables.length,
    registeredTreeDataProviderCount: treeDataProviderDisposables.length,
    registeredWatcherCount: watcherLifecycle.getRegisteredCount(),
    composition: runtimeSession.getComposition(),
    runtimeSession,
  };
}

export function deactivate() {}

function wrapCommandHandlersWithResultRendering({ handlers, window }) {
  return Object.fromEntries(
    Object.entries(handlers).map(([commandId, handler]) => [
      commandId,
      wrapCommandHandlerWithResultRendering({ handler, window }),
    ]),
  );
}

function wrapCommandHandlersWithLogging({ handlers, logger }) {
  return Object.fromEntries(
    Object.entries(handlers).map(([commandId, handler]) => [
      commandId,
      async (input) => {
        const result = await handler(input);
        await routeLogEvents({ events: result?.events ?? [], logger });
        return result;
      },
    ]),
  );
}

function wrapCommandHandlersWithAudit({ handlers, auditStore, runtimeSession }) {
  if (typeof auditStore?.appendRecord !== "function") {
    return handlers;
  }

  return Object.fromEntries(
    Object.entries(handlers).map(([commandId, handler]) => [
      commandId,
      async (input) => {
        const result = await handler(input);
        const auditEvents = (result?.events ?? []).filter((event) =>
          shouldAuditEvent(event),
        );

        for (const event of auditEvents) {
          const auditResult = await auditStore.appendRecord({
            repositoryPath:
              runtimeSession.getComposition()?.context?.mainRepositoryPath ?? "",
            record: {
              operationId: `${Date.now()}:${commandId}`,
              commandId,
              operationType: auditOperationType({ commandId, event }),
              status: auditStatusForResult({ result, event }),
              eventCode: event.code,
              diagnosticCodes: (result?.diagnostics ?? []).map(
                (diagnostic) => diagnostic.code,
              ),
              ...auditReferencesFromInput(input),
            },
          });

          if (!auditResult.ok) {
            result.diagnostics = [
              ...(result.diagnostics ?? []),
              auditResult.error,
            ];
          }
        }

        return result;
      },
    ]),
  );
}

function wrapDiagnosticActionHandlers({ handlers }) {
  const commandId = "sponzeySkills.runDiagnosticAction";

  return {
    ...handlers,
    async [commandId](input = {}) {
      const routingResult = resolveDiagnosticActionCommand({
        item: input,
        actionCode: input.actionCode,
        confirmationProvided: input.confirmationProvided === true,
      });

      if (!routingResult.ok) {
        return appendRemediationActionEvent({
          result: routingResult,
          input,
          actionCode: input.actionCode,
          status: "blocked",
          reason: routingResult.code,
        });
      }

      const delegatedHandler = handlers[routingResult.commandId];
      if (typeof delegatedHandler !== "function") {
        return {
          ok: false,
          code: "diagnostic-action-command-unavailable",
          diagnostics: [
            {
              code: "diagnostic-action-command-unavailable",
              severity: "warning",
              category: "diagnostic-action",
              actionCode: input.actionCode,
              message:
                "Diagnostic action does not have a registered command yet.",
            },
          ],
        };
      }

      const result = await delegatedHandler(routingResult.input);
      return appendRemediationActionEvent({
        result,
        input,
        actionCode: input.actionCode,
        commandId: routingResult.commandId,
        status: result?.ok === true ? "completed" : "failed",
        reason: result?.code ?? result?.diagnostics?.[0]?.code,
      });
    },
  };
}

function appendRemediationActionEvent({
  result,
  input,
  actionCode,
  commandId,
  status,
  reason,
}) {
  return {
    ...(result ?? {}),
    events: [
      ...(result?.events ?? []),
      remediationActionEvent({
        input,
        actionCode,
        commandId,
        status,
        reason,
      }),
    ],
  };
}

function remediationActionEvent({
  input,
  actionCode,
  commandId,
  status,
  reason,
}) {
  const event = {
    level: "ProductLog",
    code: `remediation.action.${status}`,
  };

  assignSafeEventField(event, "actionCode", actionCode);
  assignSafeEventField(event, "commandId", commandId);
  assignSafeEventField(event, "diagnosticCode", input?.diagnostic?.code);
  assignSafeEventField(
    event,
    "sourceId",
    input?.source?.id ?? input?.diagnostic?.sourceId,
  );
  assignSafeEventField(
    event,
    "sourceName",
    input?.source?.name ?? input?.diagnostic?.sourceName,
  );
  if (status !== "completed") {
    assignSafeEventField(event, "reason", reason);
  }

  return event;
}

function assignSafeEventField(event, key, value) {
  if (!isSafeAuditReference(value)) {
    return;
  }

  event[key] = value;
}

function shouldAuditEvent(event) {
  return /^skill\.(?:transfer|backup|source|apply)/.test(event?.code ?? "");
}

const AUDIT_OPERATION_TYPES = {
  "sponzeySkills.applySkillToGlobalTarget": "apply-skill-to-global-target",
  "sponzeySkills.removeGlobalSkillEnrollment": "remove-global-skill-enrollment",
  "sponzeySkills.applySkillToProjectTarget": "apply-skill-to-project-target",
  "sponzeySkills.removeAppliedSkill": "remove-applied-skill",
  "sponzeySkills.updateAppliedCopyFromSource": "update-copy-from-source",
  "sponzeySkills.convertAppliedSkillMode": "convert-applied-skill-mode",
  "sponzeySkills.copyAppliedSkillToMainRepository":
    "copy-applied-skill-to-main-repository",
  "sponzeySkills.backupAppliedSkillToMainRepository":
    "backup-applied-skill-to-main-repository",
  "sponzeySkills.moveAppliedSkillToMainRepository":
    "move-applied-skill-to-main-repository",
  "sponzeySkills.deleteSourceSkill": "source-delete",
  "sponzeySkills.promoteBackupToSkillSource": "backup-promote-to-source",
  "sponzeySkills.restoreBackupToTarget": "backup-restore",
  "sponzeySkills.deleteBackup": "backup-delete",
};

function auditOperationType({ commandId, event }) {
  if (typeof event?.operation === "string" && event.operation.length > 0) {
    return event.operation;
  }

  return AUDIT_OPERATION_TYPES[commandId] ?? "unknown";
}

function auditStatusForResult({ result, event }) {
  if (result?.ok === true) {
    return "completed";
  }

  if ((event?.code ?? "").endsWith(".blocked")) {
    return "blocked";
  }

  return "failed";
}

function auditReferencesFromInput(input = {}) {
  const references = {};
  assignSafeAuditReference(
    references,
    "skillName",
    input.skillName ??
      input.sourceName ??
      input.source?.name ??
      input.appliedSkill?.name ??
      input.backup?.skillName,
  );
  assignSafeAuditReference(
    references,
    "sourceName",
    input.source?.name ?? input.sourceName ?? input.skillName,
  );
  assignSafeAuditReference(
    references,
    "sourceId",
    input.source?.id ?? input.appliedSkill?.sourceId,
  );
  assignSafeAuditReference(
    references,
    "targetId",
    input.target?.id ?? input.appliedSkill?.targetId,
  );
  assignSafeAuditReference(
    references,
    "backupSnapshotId",
    input.snapshotId ?? input.backup?.snapshotId,
  );
  assignSafeAuditReference(references, "clientType", input.target?.clientType);
  assignSafeAuditReference(references, "scope", input.target?.scope);

  return references;
}

function assignSafeAuditReference(target, key, value) {
  if (!isSafeAuditReference(value)) {
    return;
  }

  target[key] = value;
}

function isSafeAuditReference(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

function selectRendererWindow({ runtime, vscodeApi }) {
  const window = runtime.window ?? vscodeApi?.window;

  if (
    typeof window?.showInformationMessage === "function" &&
    typeof window?.showWarningMessage === "function" &&
    typeof window?.showErrorMessage === "function"
  ) {
    return window;
  }

  return null;
}

function selectInputWindow({ runtime, vscodeApi }) {
  const window = runtime.window ?? vscodeApi?.window;

  if (typeof window?.showInputBox === "function") {
    return window;
  }

  return null;
}

function createTreeDataProviders({ runtimeSession, vscodeApi, extensionUri }) {
  if (
    !runtimeSession?.getComposition?.() ||
    typeof vscodeApi?.window?.registerTreeDataProvider !== "function"
  ) {
    return null;
  }

  return createSkillsTreeDataProviders({
    loadReadModel: createTreeReadModelLoader({
      runtimeSession,
    }),
    eventEmitterFactory: createTreeEventEmitterFactory({ vscodeApi }),
    themeIconFactory: createThemeIconFactory({ vscodeApi, extensionUri }),
  });
}

function registerTreeDataProviders({ providers, vscodeApi }) {
  if (!providers) {
    return [];
  }

  return registerSponzeyTreeDataProviders({
    windowApi: vscodeApi.window,
    providers,
  });
}

function createRefreshWatcherLifecycle({
  runtimeSession,
  providers,
  vscodeApi,
  logger,
}) {
  let currentDisposables = [];

  return {
    start() {
      currentDisposables = registerRefreshWatchers({
        runtimeSession,
        providers,
        vscodeApi,
        logger,
      });
      return currentDisposables;
    },
    restart() {
      const disposedCount = disposeRefreshWatchers(currentDisposables);
      currentDisposables = registerRefreshWatchers({
        runtimeSession,
        providers,
        vscodeApi,
        logger,
      });
      return {
        ok: true,
        disposedCount,
        registeredCount: currentDisposables.length,
      };
    },
    dispose() {
      disposeRefreshWatchers(currentDisposables);
      currentDisposables = [];
    },
    getRegisteredCount() {
      return currentDisposables.length;
    },
  };
}

function disposeRefreshWatchers(disposables) {
  let disposedCount = 0;

  for (const disposable of disposables ?? []) {
    if (typeof disposable?.dispose !== "function") {
      continue;
    }

    disposable.dispose();
    disposedCount += 1;
  }

  return disposedCount;
}

function registerRefreshWatchers({
  runtimeSession,
  providers,
  vscodeApi,
  logger,
}) {
  if (
    !providers ||
    typeof vscodeApi?.workspace?.createFileSystemWatcher !== "function"
  ) {
    return [];
  }

  const composition = runtimeSession.getComposition();
  const context = composition?.context;
  if (!context) {
    return [];
  }

  const refresh = async () => {
    const currentComposition = runtimeSession.getComposition();
    const result =
      await currentComposition?.commandHandlers?.[
        "sponzeySkills.refreshSkills"
      ]?.();

    refreshSponzeyTreeDataProviders({
      providers,
      readModel: result?.readModel,
    });
    await routeLogEvents({ events: result?.events ?? [], logger });
    return result;
  };
  const controller = createRefreshInvalidationController({
    refresh,
    productLog: async (event) => {
      await routeLogEvents({ events: [event], logger });
    },
    fieldDebugLog: async (event) => {
      await routeLogEvents({ events: [event], logger });
    },
  });

  const disposables = [];
  const shouldIgnoreWatcherEvent = (uri) =>
    isInternalRepositoryMetadataPath({
      eventPath: uri?.fsPath,
      mainRepositoryPath: context.mainRepositoryPath,
    });
  for (const watchPath of watchedPathsFromContext(context)) {
    let watcher;
    try {
      watcher = vscodeApi.workspace.createFileSystemWatcher(
        watcherPattern({ vscodeApi, watchPath }),
      );
    } catch {
      logWatcherRegistrationFailure({
        logger,
        reason: "watcher-creation-failed",
      });
      continue;
    }

    disposables.push(watcher);
    disposables.push(
      registerWatcherEvent({
        watcher,
        eventName: "onDidCreate",
        type: "create",
        controller,
        logger,
        shouldIgnore: shouldIgnoreWatcherEvent,
      }),
      registerWatcherEvent({
        watcher,
        eventName: "onDidChange",
        type: "change",
        controller,
        logger,
        shouldIgnore: shouldIgnoreWatcherEvent,
      }),
      registerWatcherEvent({
        watcher,
        eventName: "onDidDelete",
        type: "delete",
        controller,
        logger,
        shouldIgnore: shouldIgnoreWatcherEvent,
      }),
    );
  }

  return disposables.filter(Boolean);
}

function registerWatcherEvent({
  watcher,
  eventName,
  type,
  controller,
  logger,
  shouldIgnore,
}) {
  if (typeof watcher?.[eventName] !== "function") {
    return null;
  }

  try {
    return watcher[eventName]((uri) => {
      if (shouldIgnore?.(uri)) {
        return;
      }

      return controller.invalidate({
        type,
        path: uri?.fsPath,
      });
    });
  } catch {
    logWatcherRegistrationFailure({
      logger,
      reason: "watcher-event-registration-failed",
    });
    return null;
  }
}

function logWatcherRegistrationFailure({ logger, reason }) {
  void routeLogEvents({
    events: [
      {
        level: "ProductLog",
        code: "watcher.registration.failed",
        reason,
      },
    ],
    logger,
  });
}

function watchedPathsFromContext(context) {
  const paths = [
    context.mainRepositoryPath,
    ...(context.globalTargets ?? []).map((target) => target.targetPath),
    ...(context.projectTargets ?? []).map((target) => target.targetPath),
  ]
    .map(normalizeWatchPath)
    .filter((value) => value.length > 0);

  return [...new Set(paths)];
}

function normalizeWatchPath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function isInternalRepositoryMetadataPath({
  eventPath,
  mainRepositoryPath,
}) {
  const normalizedEventPath = normalizeWatchPath(eventPath);
  const normalizedRepositoryPath = normalizeWatchPath(mainRepositoryPath);

  if (!normalizedEventPath || !normalizedRepositoryPath) {
    return false;
  }

  const metadataPath = `${normalizedRepositoryPath}/.sponzey`;
  return (
    normalizedEventPath === metadataPath ||
    normalizedEventPath.startsWith(`${metadataPath}/`)
  );
}

function watcherPattern({ vscodeApi, watchPath }) {
  if (typeof vscodeApi?.RelativePattern === "function") {
    return new vscodeApi.RelativePattern(watchPath, "**/*");
  }

  return `${watchPath.replace(/\\/g, "/")}/**/*`;
}

function wrapRefreshHandlerWithTreeDataProviderUpdate({
  handlers,
  providers,
}) {
  const commandId = "sponzeySkills.refreshSkills";

  return {
    ...handlers,
    async [commandId](input) {
      const result = await handlers[commandId](input);
      refreshSponzeyTreeDataProviders({
        providers,
        readModel: result?.readModel,
      });
      return result;
    },
  };
}

function wrapRuntimeMutationHandlers({
  handlers,
  runtimeSession,
  providers,
  watcherLifecycle,
  defaultMainRepositoryPath,
  defaultGlobalTargets,
}) {
  const refreshCommandId = "sponzeySkills.refreshSkills";
  const refreshHandler = handlers[refreshCommandId];
  const mutationCommandIds = [
    "sponzeySkills.createSkill",
    "sponzeySkills.importSkill",
    "sponzeySkills.installSkill",
    "sponzeySkills.applySkillToGlobalTarget",
    "sponzeySkills.removeGlobalSkillEnrollment",
    "sponzeySkills.applySkillToProjectTarget",
    "sponzeySkills.removeAppliedSkill",
    "sponzeySkills.analyzeAllSkills",
    "sponzeySkills.updateAppliedCopyFromSource",
    "sponzeySkills.convertAppliedSkillMode",
    "sponzeySkills.copyAppliedSkillToMainRepository",
    "sponzeySkills.backupAppliedSkillToMainRepository",
    "sponzeySkills.moveAppliedSkillToMainRepository",
    "sponzeySkills.renameSourceSkill",
    "sponzeySkills.deleteSourceSkill",
    "sponzeySkills.importSkillArchive",
    "sponzeySkills.promoteBackupToSkillSource",
    "sponzeySkills.restoreBackupToTarget",
    "sponzeySkills.deleteBackup",
  ];
  const mainRepositoryReadCommandIds = [
    "sponzeySkills.refreshSkills",
    "sponzeySkills.openMainRepository",
    "sponzeySkills.exportSourceSkill",
    "sponzeySkills.listSkillBackups",
  ];
  const settingsCommandIds = [
    "sponzeySkills.setMainRepository",
    "sponzeySkills.removeMainRepository",
    "sponzeySkills.addGlobalRepository",
    "sponzeySkills.removeGlobalRepository",
    "sponzeySkills.addProjectRepository",
    "sponzeySkills.removeProjectRepository",
  ];

  return {
    ...handlers,
    ...Object.fromEntries(
      mainRepositoryReadCommandIds.map((commandId) => [
        commandId,
        async (input) => {
          const ensureResult = await ensureMainRepository({
            handlers,
            runtimeSession,
            providers,
            refreshHandler,
            defaultMainRepositoryPath,
            refreshAfterSetup: commandId !== refreshCommandId,
          });

          if (!ensureResult.ok) {
            return ensureResult.result;
          }

          return handlers[commandId](input);
        },
      ]),
    ),
    ...Object.fromEntries(
      mutationCommandIds.map((commandId) => [
        commandId,
        async (input) => {
          if (requiresMainRepository(commandId)) {
            const ensureResult = await ensureMainRepository({
              handlers,
              runtimeSession,
              providers,
              refreshHandler,
              defaultMainRepositoryPath,
            });

            if (!ensureResult.ok) {
              return ensureResult.result;
            }
          }

          if (
            commandId === "sponzeySkills.applySkillToGlobalTarget" &&
            !hasCommandTarget(input)
          ) {
            const ensureResult = await ensureGlobalTargets({
              handlers,
              runtimeSession,
              providers,
              refreshHandler,
              defaultGlobalTargets,
            });

            if (!ensureResult.ok) {
              return ensureResult.result;
            }
          }

          const result = await handlers[commandId](input);

          if (result?.ok === true && providers) {
            const refreshResult = await refreshHandler();

            if (isAnalyzeCommand(commandId)) {
              refreshSponzeyTreeDataProviders({
                providers,
                readModel: readModelWithAdditionalDiagnostics({
                  readModel: refreshResult?.readModel,
                  diagnostics: result.diagnostics,
                }),
              });
            }
          }

          return result;
        },
      ]),
    ),
    ...Object.fromEntries(
      settingsCommandIds.map((commandId) => [
        commandId,
        async (input) => {
          const result = await handlers[commandId](input);

          if (result?.ok === true) {
            const recomposeResult = await runtimeSession.recompose();
            const watcherRecomposition =
              recomposeResult?.ok === true
                ? watcherLifecycle?.restart?.()
                : undefined;
            if (providers) {
              const refreshResult = await refreshHandler();
              refreshSponzeyTreeDataProviders({
                providers,
                readModel: refreshResult?.readModel,
              });
            }

            return {
              ...result,
              runtimeRecomposition: recomposeResult,
              watcherRecomposition,
            };
          }

          return result;
        },
      ]),
    ),
  };
}

async function ensureGlobalTargets({
  handlers,
  runtimeSession,
  providers,
  refreshHandler,
  defaultGlobalTargets,
}) {
  const currentTargets =
    runtimeSession.getComposition()?.context?.globalTargets ?? [];

  if (currentTargets.length > 0) {
    return {
      ok: true,
    };
  }

  const defaultTarget = (defaultGlobalTargets ?? []).find(
    (target) => hasText(target?.targetPath) && hasText(target?.clientType),
  );

  if (!defaultTarget) {
    return {
      ok: true,
    };
  }

  const addResult = await handlers["sponzeySkills.addGlobalRepository"]({
    targetPath: defaultTarget.targetPath,
    clientType: defaultTarget.clientType,
  });

  if (addResult?.ok !== true && !isGlobalTargetConflict(addResult)) {
    return {
      ok: false,
      result: addResult,
    };
  }

  const recomposeResult = await runtimeSession.recompose();
  if (recomposeResult?.ok !== true) {
    return {
      ok: false,
      result: recomposeResult,
    };
  }

  const nextTargets =
    runtimeSession.getComposition()?.context?.globalTargets ?? [];
  if (nextTargets.length === 0) {
    return {
      ok: false,
      result: {
        ok: false,
        diagnostics: [
          {
            code: "default-global-target-unavailable",
            severity: "error",
            message: "Default global target could not be registered.",
          },
        ],
        events: [
          {
            level: "ProductLog",
            code: "globalRepository.defaultSetup.failed",
            reason: "default-global-target-unavailable",
          },
        ],
        steps: ["CheckingGlobalTargets", "DefaultTargetUnavailable"],
      },
    };
  }

  if (providers) {
    const refreshResult = await refreshHandler();
    refreshSponzeyTreeDataProviders({
      providers,
      readModel: refreshResult?.readModel,
    });
  }

  return {
    ok: true,
  };
}

async function ensureMainRepository({
  handlers,
  runtimeSession,
  providers,
  refreshHandler,
  defaultMainRepositoryPath,
  refreshAfterSetup = true,
}) {
  const currentPath =
    runtimeSession.getComposition()?.context?.mainRepositoryPath ?? "";

  if (typeof currentPath === "string" && currentPath.trim().length > 0) {
    return {
      ok: true,
    };
  }

  const setInput = hasText(defaultMainRepositoryPath)
    ? { mainRepositoryPath: defaultMainRepositoryPath }
    : undefined;
  const setResult = await handlers["sponzeySkills.setMainRepository"](setInput);
  if (setResult?.ok !== true) {
    return {
      ok: false,
      result: setResult,
    };
  }

  const recomposeResult = await runtimeSession.recompose();
  if (recomposeResult?.ok !== true) {
    return {
      ok: false,
      result: recomposeResult,
    };
  }

  if (providers && refreshAfterSetup) {
    const refreshResult = await refreshHandler();
    refreshSponzeyTreeDataProviders({
      providers,
      readModel: refreshResult?.readModel,
    });
  }

  return {
    ok: true,
  };
}

function createDefaultMainRepositoryPath() {
  const homePath = homedir();

  if (!hasText(homePath)) {
    return "";
  }

  return `${homePath.replace(/\\/g, "/").replace(/\/+$/, "")}/SponzeySkills`;
}

function createDefaultGlobalTargets() {
  const homePath = homedir();

  if (!hasText(homePath)) {
    return [];
  }

  const normalizedHomePath = homePath.replace(/\\/g, "/").replace(/\/+$/, "");

  return [
    {
      clientType: "codex",
      targetPath: `${normalizedHomePath}/.agents/skills`,
    },
    {
      clientType: "claude",
      targetPath: `${normalizedHomePath}/.claude/skills`,
    },
  ];
}

function isGlobalTargetConflict(result) {
  return (result?.diagnostics ?? []).some(
    (diagnostic) => diagnostic?.code === "global-target-conflict",
  );
}

function requiresMainRepository(commandId) {
  return new Set([
    "sponzeySkills.refreshSkills",
    "sponzeySkills.openMainRepository",
    "sponzeySkills.createSkill",
    "sponzeySkills.importSkill",
    "sponzeySkills.installSkill",
    "sponzeySkills.applySkillToGlobalTarget",
    "sponzeySkills.removeGlobalSkillEnrollment",
    "sponzeySkills.applySkillToProjectTarget",
    "sponzeySkills.analyzeAllSkills",
    "sponzeySkills.updateAppliedCopyFromSource",
    "sponzeySkills.convertAppliedSkillMode",
    "sponzeySkills.copyAppliedSkillToMainRepository",
    "sponzeySkills.backupAppliedSkillToMainRepository",
    "sponzeySkills.moveAppliedSkillToMainRepository",
    "sponzeySkills.renameSourceSkill",
    "sponzeySkills.deleteSourceSkill",
    "sponzeySkills.exportSourceSkill",
    "sponzeySkills.importSkillArchive",
    "sponzeySkills.listSkillBackups",
    "sponzeySkills.promoteBackupToSkillSource",
    "sponzeySkills.restoreBackupToTarget",
    "sponzeySkills.deleteBackup",
  ]).has(commandId);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCommandTarget(input) {
  return hasText(input?.target?.id) && hasText(input?.target?.targetPath);
}

function isAnalyzeCommand(commandId) {
  return commandId === "sponzeySkills.analyzeAllSkills";
}

function readModelWithAdditionalDiagnostics({ readModel, diagnostics }) {
  const baseReadModel = readModel ?? emptyReadModel();

  return {
    ...baseReadModel,
    diagnostics: mergeReadModelDiagnostics({
      baseDiagnostics: baseReadModel.diagnostics,
      additionalDiagnostics: diagnostics,
    }),
  };
}

function mergeReadModelDiagnostics({
  baseDiagnostics = [],
  additionalDiagnostics = [],
}) {
  const merged = [];
  const seen = new Set();

  for (const diagnostic of [
    ...(Array.isArray(baseDiagnostics) ? baseDiagnostics : []),
    ...(Array.isArray(additionalDiagnostics) ? additionalDiagnostics : []),
  ]) {
    const key = diagnosticIdentity(diagnostic);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(diagnostic);
  }

  return merged;
}

function diagnosticIdentity(diagnostic) {
  const hasStableReference = hasText(diagnostic?.sourceId) || hasText(diagnostic?.targetId);

  return [
    diagnostic?.code ?? "",
    diagnostic?.category ?? "",
    diagnostic?.sourceId ?? "",
    diagnostic?.targetId ?? "",
    hasStableReference ? "" : diagnostic?.skillName ?? "",
  ].join("|");
}

function createTreeReadModelLoader({ runtimeSession }) {
  return async () => {
    const composition = runtimeSession.getComposition();

    if (!composition.ok) {
      return emptyReadModel({ diagnostics: composition.diagnostics });
    }

    const refreshResult =
      await composition.commandHandlers["sponzeySkills.refreshSkills"]();

    return (
      refreshResult.readModel ??
      emptyReadModel({ diagnostics: refreshResult.diagnostics })
    );
  };
}

function createTreeEventEmitterFactory({ vscodeApi }) {
  if (typeof vscodeApi?.EventEmitter !== "function") {
    return undefined;
  }

  return () => new vscodeApi.EventEmitter();
}

function createThemeIconFactory({ vscodeApi, extensionUri }) {
  const agentIconFiles = {
    "agent-codex": "agent-codex.svg",
    "agent-claude": "agent-claude.svg",
  };

  if (typeof vscodeApi?.Uri?.joinPath === "function" && extensionUri) {
    return (iconId) => {
      const fileName = agentIconFiles[iconId];
      if (fileName) {
        return vscodeApi.Uri.joinPath(extensionUri, "media", fileName);
      }

      if (typeof vscodeApi?.ThemeIcon === "function") {
        return new vscodeApi.ThemeIcon(iconId);
      }

      return { id: iconId };
    };
  }

  if (typeof vscodeApi?.ThemeIcon === "function") {
    return (iconId) => new vscodeApi.ThemeIcon(iconId);
  }

  return undefined;
}

function emptyReadModel({ diagnostics = [] } = {}) {
  return {
    mainRepositorySkills: [],
    globalSkills: [],
    projectSkills: [],
    diagnostics,
  };
}

async function createComposition({
  runtime,
  vscodeApi,
  adapters,
  standardGlobalTargets = [],
}) {
  if (runtime.composition) {
    return runtime.composition;
  }

  const settingsReader =
    runtime.settingsReader ??
    (vscodeApi?.workspace
      ? createVsCodeSettingsReader({ workspace: vscodeApi.workspace })
      : null);

  if (!settingsReader) {
    return null;
  }

  return createExtensionComposition({
    settingsReader,
    workspaceRoots:
      runtime.workspaceRoots ??
      (vscodeApi?.workspace
        ? readVsCodeWorkspaceRoots(vscodeApi.workspace)
        : []),
    standardGlobalTargets,
    adapters,
    analyzer: runtime.analyzer,
  });
}

function createAdapters({ runtime, vscodeApi }) {
  return {
    ...defaultAdapters({ vscodeApi }),
    ...(runtime.adapters ?? {}),
  };
}

function defaultAdapters({ vscodeApi }) {
  const adapters = {
    auditStore: new FileSystemTransferAuditStore(),
  };

  if (vscodeApi?.workspace) {
    adapters.settingsWriter = createVsCodeSettingsWriter({
      workspace: vscodeApi.workspace,
      ConfigurationTarget: vscodeApi.ConfigurationTarget,
    });
  }

  if (vscodeApi?.env && vscodeApi?.Uri) {
    adapters.repositoryOpener = createVsCodeRepositoryOpener({
      env: vscodeApi.env,
      Uri: vscodeApi.Uri,
      workspace: vscodeApi.workspace,
      window: vscodeApi.window,
    });
  }

  if (vscodeApi?.window) {
    const logger = createVsCodeOutputChannelLogger({
      window: vscodeApi.window,
    });

    if (logger) {
      adapters.logger = logger;
    }
  }

  return adapters;
}

async function loadVscodeApi() {
  try {
    return await import("vscode");
  } catch {
    return null;
  }
}
