import test from "node:test";
import assert from "node:assert/strict";

import { activate } from "../src/extension.js";
import { SPONZEY_TREE_VIEWS } from "../src/presentation/index.js";

test("activate composes settings once and registers composed command handlers", async () => {
  let getConfigurationCount = 0;
  const registered = [];
  const context = { subscriptions: [] };
  const activation = await activate(context, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registered.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          getConfigurationCount += 1;
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const refreshHandler = registered.find(
    ([commandId]) => commandId === "sponzeySkills.refreshSkills",
  )[1];
  const refreshResult = await refreshHandler();

  assert.equal(getConfigurationCount, 1);
  assert.equal(activation.composition.ok, true);
  assert.equal(activation.registeredCommandCount, registered.length);
  assert.equal(context.subscriptions.length, registered.length);
  assert.equal(refreshResult.readModel.mainRepositorySkills[0].name, "alpha");
  assert.equal(getConfigurationCount, 1);
});

test("activate wraps registered command handlers with result rendering when window exists", async () => {
  const registered = [];
  const messages = [];
  const context = { subscriptions: [] };
  await activate(context, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registered.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInformationMessage(message) {
          messages.push(["info", message]);
        },
        async showWarningMessage(message) {
          messages.push(["warning", message]);
        },
        async showErrorMessage(message) {
          messages.push(["error", message]);
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const refreshHandler = registered.find(
    ([commandId]) => commandId === "sponzeySkills.refreshSkills",
  )[1];
  const refreshResult = await refreshHandler();

  assert.equal(refreshResult.ok, true);
  assert.equal(refreshResult.readModel.mainRepositorySkills[0].name, "alpha");
  assert.deepEqual(messages, [
    ["info", "Sponzey Skills: skills.refresh.completed"],
  ]);
});

test("activate writes confirmation-required command audit records as blocked", async () => {
  const registered = [];
  const auditRecords = [];
  const context = { subscriptions: [] };
  await activate(context, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registered.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      auditStore: {
        async appendRecord({ repositoryPath, record }) {
          assert.equal(repositoryPath, "/repo");
          auditRecords.push(record);
          return { ok: true };
        },
      },
      skillRepository: {
        async deleteSourceSkill() {
          throw new Error("delete source must not run without impact confirmation");
        },
      },
    },
  });

  const deleteSourceHandler = registered.find(
    ([commandId]) => commandId === "sponzeySkills.deleteSourceSkill",
  )[1];
  const result = await deleteSourceHandler({
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
      appliedTargetCount: 1,
    },
    skillName: "alpha",
    confirmationProvided: true,
  });

  assert.equal(result.ok, false);
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].commandId, "sponzeySkills.deleteSourceSkill");
  assert.equal(auditRecords[0].operationType, "source-delete");
  assert.equal(auditRecords[0].status, "blocked");
  assert.equal(auditRecords[0].eventCode, "skill.source.delete.blocked");
  assert.deepEqual(auditRecords[0].diagnosticCodes, [
    "source-delete-impact-confirmation-required",
  ]);
  assert.equal(auditRecords[0].sourceName, "alpha");
  assert.equal(JSON.stringify(auditRecords[0]).includes("/repo/skills/alpha"), false);
});

test("activate registers tree data providers when window supports tree views", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const context = { subscriptions: [] };
  const activation = await activate(context, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const mainRepositoryProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.mainRepository",
  )[1];
  const mainRepositoryChildren = await mainRepositoryProvider.getChildren();

  assert.equal(activation.registeredTreeDataProviderCount, SPONZEY_TREE_VIEWS.length);
  assert.deepEqual(
    registeredTrees.map(([viewId]) => viewId),
    SPONZEY_TREE_VIEWS.map((view) => view.id),
  );
  assert.deepEqual(
    mainRepositoryChildren.map((item) => item.label),
    ["alpha"],
  );
  assert.equal(
    context.subscriptions.length,
    registeredCommands.length + registeredTrees.length,
  );
});

test("refresh command updates registered tree provider cache", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const context = { subscriptions: [] };
  let sourceName = "alpha";
  let scanCount = 0;
  const activation = await activate(context, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          scanCount += 1;
          return {
            ok: true,
            sources: [
              {
                id: sourceName,
                name: sourceName,
                sourcePath: `/repo/skills/${sourceName}`,
              },
            ],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const mainRepositoryProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.mainRepository",
  )[1];
  const refreshHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.refreshSkills",
  )[1];
  const initialChildren = await mainRepositoryProvider.getChildren();
  sourceName = "beta";
  const refreshResult = await refreshHandler();
  const updatedChildren = await mainRepositoryProvider.getChildren();

  assert.equal(activation.registeredTreeDataProviderCount, SPONZEY_TREE_VIEWS.length);
  assert.equal(refreshResult.ok, true);
  assert.equal(scanCount, 2);
  assert.deepEqual(
    initialChildren.map((item) => item.label),
    ["alpha"],
  );
  assert.deepEqual(
    updatedChildren.map((item) => item.label),
    ["beta"],
  );
});

test("watcher refresh reports failed refresh result through watcher Product Log", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const watcherCallbacks = [];
  const productEvents = [];
  const fieldDebugEvents = [];
  const context = { subscriptions: [] };
  const activation = await activate(context, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        createFileSystemWatcher(pattern) {
          return {
            pattern,
            onDidCreate(callback) {
              watcherCallbacks.push(["create", callback]);
              return { dispose() {} };
            },
            onDidChange(callback) {
              watcherCallbacks.push(["change", callback]);
              return { dispose() {} };
            },
            onDidDelete(callback) {
              watcherCallbacks.push(["delete", callback]);
              return { dispose() {} };
            },
            dispose() {},
          };
        },
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
        async fieldDebug(event) {
          fieldDebugEvents.push(event);
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: false,
            error: {
              code: "source-scan-failed",
              severity: "error",
              message: "Source scan failed.",
            },
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run when source scan fails");
        },
      },
    },
  });

  assert.equal(activation.registeredWatcherCount, 4);
  const changeCallback = watcherCallbacks.find(([type]) => type === "change")[1];
  changeCallback({ fsPath: "/repo/.sponzey/index.json" });
  await delay(130);

  assert.equal(
    productEvents.some((event) => event.code === "watcher.refresh.failed"),
    false,
  );
  assert.equal(
    fieldDebugEvents.some((event) => event.code === "watcher.event.received"),
    false,
  );

  changeCallback({ fsPath: "/repo/skills/alpha/SKILL.md" });
  await delay(130);

  const watcherFailure = productEvents.find(
    (event) => event.code === "watcher.refresh.failed",
  );
  assert.equal(watcherFailure?.reason, "source-scan-failed");
  assert.equal(
    fieldDebugEvents.some(
      (event) =>
        event.code === "watcher.debounce.completed" &&
        event.status === "failed",
    ),
    true,
  );
});

test("settings recomposition restarts refresh watchers and disposes old watchers", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const createdWatchers = [];
  const disposeCalls = [];
  let mainRepositoryPath = "/repo-a";
  const context = { subscriptions: [] };
  const activation = await activate(context, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      ConfigurationTarget: {
        Global: "global",
      },
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        createFileSystemWatcher(pattern) {
          const watcher = {
            pattern,
            onDidCreate() {
              return watcherDisposable(disposeCalls, "create", pattern);
            },
            onDidChange() {
              return watcherDisposable(disposeCalls, "change", pattern);
            },
            onDidDelete() {
              return watcherDisposable(disposeCalls, "delete", pattern);
            },
            dispose() {
              disposeCalls.push(["watcher", pattern]);
            },
          };
          createdWatchers.push(watcher);
          return watcher;
        },
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return mainRepositoryPath;
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
            async update(key, value) {
              if (key === "mainRepositoryPath") {
                mainRepositoryPath = value;
              }
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async initializeRepository() {
          return { ok: true };
        },
        async scanSourceSkills(input) {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: `${input.repositoryPath}/skills/alpha`,
              },
            ],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  assert.equal(activation.registeredWatcherCount, 4);
  assert.deepEqual(
    createdWatchers.map((watcher) => watcher.pattern),
    ["/repo-a/**/*"],
  );

  const setHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.setMainRepository",
  )[1];
  const result = await setHandler({ mainRepositoryPath: "/repo-b" });

  assert.equal(result.ok, true);
  assert.equal(createdWatchers.length, 2);
  assert.deepEqual(disposeCalls, [
    ["watcher", "/repo-a/**/*"],
    ["create", "/repo-a/**/*"],
    ["change", "/repo-a/**/*"],
    ["delete", "/repo-a/**/*"],
  ]);
  assert.equal(createdWatchers.at(-1).pattern, "/repo-b/**/*");
});

test("add all project repositories keeps the default Codex target and adds Claude", async () => {
  const registeredCommands = [];
  let projectTargetPatterns = [".agents/skills"];

  await activate({ subscriptions: [] }, {
    vscodeApi: {
      ConfigurationTarget: {
        Global: "global",
      },
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox() {},
        async showQuickPick(items) {
          return items.find((item) => item.value === "all");
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        ConfigurationTarget: {
          Global: "global",
        },
        workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              if (key === "projectTargetPatterns") {
                return projectTargetPatterns;
              }
              return defaultValue;
            },
            async update(key, value, target) {
              assert.equal(target, "global");
              if (key === "projectTargetPatterns") {
                projectTargetPatterns = value;
              }
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return { ok: true, sources: [] };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return { ok: true, appliedSkills: [], diagnostics: [] };
        },
      },
    },
  });

  const addHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.addProjectRepository",
  )[1];
  const result = await addHandler();

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(projectTargetPatterns, [
    ".agents/skills",
    ".claude/skills",
  ]);
  assert.deepEqual(result.targetPatterns, [
    ".agents/skills",
    ".claude/skills",
  ]);
});

test("activation dedupes normalized refresh watcher paths", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const createdPatterns = [];
  const activation = await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        createFileSystemWatcher(pattern) {
          createdPatterns.push(pattern);
          return {
            onDidCreate() {
              return { dispose() {} };
            },
            onDidChange() {
              return { dispose() {} };
            },
            onDidDelete() {
              return { dispose() {} };
            },
            dispose() {},
          };
        },
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [
                  { clientType: "codex", targetPath: "/global" },
                  { clientType: "codex", targetPath: "/global/" },
                ];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            appliedSkills: [],
            diagnostics: [],
          };
        },
      },
    },
  });

  assert.equal(activation.registeredWatcherCount, 8);
  assert.deepEqual(createdPatterns, ["/repo/**/*", "/global/**/*"]);
});

test("watcher registration failure logs Product Log without failing activation", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const productEvents = [];
  const activation = await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        createFileSystemWatcher() {
          throw new Error("cannot watch /repo");
        },
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  assert.equal(activation.registeredCommandCount, registeredCommands.length);
  assert.equal(activation.registeredTreeDataProviderCount, registeredTrees.length);
  assert.equal(activation.registeredWatcherCount, 0);
  assert.deepEqual(productEvents, [
    {
      level: "ProductLog",
      code: "watcher.registration.failed",
      reason: "watcher-creation-failed",
    },
  ]);
});

test("watcher event registration failure logs Product Log and keeps valid disposables", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const productEvents = [];
  const activation = await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        createFileSystemWatcher() {
          return {
            onDidCreate() {
              return { dispose() {} };
            },
            onDidChange() {
              throw new Error("cannot register change callback");
            },
            onDidDelete() {
              return { dispose() {} };
            },
            dispose() {},
          };
        },
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  assert.equal(activation.registeredWatcherCount, 3);
  assert.deepEqual(productEvents, [
    {
      level: "ProductLog",
      code: "watcher.registration.failed",
      reason: "watcher-event-registration-failed",
    },
  ]);
});

test("analyze command updates registered diagnostics tree provider cache", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const context = { subscriptions: [] };
  await activate(context, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    analyzer: {
      async analyzeSourceSkill({ source }) {
        return {
          riskLevel: "low",
          diagnostics: [
            {
              code: "external-dependencies-detected",
              severity: "warning",
              message: "Skill declares external dependencies.",
              sourceId: source.id,
            },
          ],
        };
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
      },
      hashPort: {
        async hashDirectory({ directoryPath }) {
          assert.equal(directoryPath, "/repo/skills/alpha");
          return { ok: true, hash: "source-hash-alpha" };
        },
      },
      analysisStore: {
        async writeAnalysisMetadata({ repositoryPath, metadata }) {
          assert.equal(repositoryPath, "/repo");
          assert.equal(metadata.skillId, "alpha");
          assert.equal(metadata.sourceHash, "source-hash-alpha");
          return { ok: true };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const diagnosticsProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.diagnostics",
  )[1];
  const analyzeHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.analyzeAllSkills",
  )[1];
  const initialDiagnostics = await diagnosticsProvider.getChildren();
  const analyzeResult = await analyzeHandler();
  const updatedDiagnostics = await diagnosticsProvider.getChildren();
  const updatedCategories = await diagnosticsProvider.getChildren(
    updatedDiagnostics[0],
  );
  const updatedDiagnosticItems = await diagnosticsProvider.getChildren(
    updatedCategories[0],
  );

  assert.equal(analyzeResult.ok, true);
  assert.deepEqual(
    initialDiagnostics.map((item) => item.label),
    [],
  );
  assert.deepEqual(
    updatedDiagnostics.map((item) => [
      item.label,
      item.description,
      item.detail,
    ]),
    [["warning", undefined, undefined]],
  );
  assert.deepEqual(
    updatedCategories.map((item) => [
      item.label,
      item.description,
      item.detail,
    ]),
    [["uncategorized", "1 item", undefined]],
  );
  assert.deepEqual(
    updatedDiagnosticItems.map((item) => [
      item.label,
      item.description,
      item.detail,
    ]),
    [
      [
        "external-dependencies-detected",
        "alpha · warning",
        "Skill declares external dependencies.",
      ],
    ],
  );
});

test("diagnostic action command delegates safe action to existing command handler", async () => {
  const registeredCommands = [];
  const openedPaths = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      repositoryOpener: {
        async openPath(input) {
          openedPaths.push(input);
          return { ok: true };
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            groups: [],
          };
        },
      },
    },
  });

  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const result = await diagnosticActionHandler({
    actionCode: "open-skill-md",
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
    diagnostic: {
      code: "external-dependencies-detected",
      severity: "warning",
      category: "dependency",
      sourceId: "alpha",
    },
    diagnosticActions: {
      allowedActionCodes: ["open-skill-md"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: [],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(openedPaths, [
    {
      path: "/repo/skills/alpha/SKILL.md",
      openMode: "editor",
    },
  ]);
});

test("diagnostic action command logs completed Product Log without raw paths", async () => {
  const registeredCommands = [];
  const productEvents = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      repositoryOpener: {
        async openPath() {
          return { ok: true };
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            groups: [],
          };
        },
      },
    },
  });

  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const result = await diagnosticActionHandler({
    actionCode: "open-skill-md",
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
    diagnostic: {
      code: "external-dependencies-detected",
      severity: "warning",
      category: "dependency",
      sourceId: "alpha",
    },
    diagnosticActions: {
      allowedActionCodes: ["open-skill-md"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: [],
    },
  });

  assert.equal(result.ok, true);
  const remediationEvent = productEvents.find(
    (event) => event.code === "remediation.action.completed",
  );
  assert.deepEqual(remediationEvent, {
    level: "ProductLog",
    code: "remediation.action.completed",
    actionCode: "open-skill-md",
    commandId: "sponzeySkills.openSkillMd",
    diagnosticCode: "external-dependencies-detected",
    sourceId: "alpha",
    sourceName: "alpha",
  });
  assert.equal(JSON.stringify(remediationEvent).includes("/repo"), false);
});

test("diagnostic action command logs failed Product Log for delegated failures", async () => {
  const registeredCommands = [];
  const productEvents = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      repositoryOpener: {
        async openPath() {
          return {
            ok: false,
            error: {
              code: "repository-open-failed",
              severity: "error",
              message: "Repository opener failed.",
            },
          };
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            groups: [],
          };
        },
      },
    },
  });

  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const result = await diagnosticActionHandler({
    actionCode: "open-skill-md",
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
    diagnostic: {
      code: "external-dependencies-detected",
      severity: "warning",
      category: "dependency",
      sourceId: "alpha",
    },
    diagnosticActions: {
      allowedActionCodes: ["open-skill-md"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: [],
    },
  });

  assert.equal(result.ok, false);
  const remediationEvent = productEvents.find(
    (event) => event.code === "remediation.action.failed",
  );
  assert.deepEqual(remediationEvent, {
    level: "ProductLog",
    code: "remediation.action.failed",
    actionCode: "open-skill-md",
    commandId: "sponzeySkills.openSkillMd",
    diagnosticCode: "external-dependencies-detected",
    sourceId: "alpha",
    sourceName: "alpha",
    reason: "repository-open-failed",
  });
  assert.equal(JSON.stringify(remediationEvent).includes("/repo"), false);
});

test("diagnostic action command blocks mutating action before delegation", async () => {
  const registeredCommands = [];
  let openerCalled = false;
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      repositoryOpener: {
        async openPath() {
          openerCalled = true;
          return { ok: true };
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
    },
  });

  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const result = await diagnosticActionHandler({
    actionCode: "apply-skill-to-target",
    diagnostic: {
      code: "missing-description",
      severity: "warning",
      category: "quality",
    },
    diagnosticActions: {
      allowedActionCodes: ["apply-skill-to-target"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: ["apply-skill-to-target"],
    },
  });

  assert.equal(openerCalled, false);
  assert.deepEqual(result, {
    ok: false,
    code: "diagnostic-action-confirmation-required",
    diagnostics: [
      {
        code: "diagnostic-action-confirmation-required",
        severity: "warning",
        category: "diagnostic-action",
        actionCode: "apply-skill-to-target",
        message:
          "Diagnostic action requires confirmation workflow before execution.",
      },
    ],
    events: [
      {
        level: "ProductLog",
        code: "remediation.action.blocked",
        actionCode: "apply-skill-to-target",
        diagnosticCode: "missing-description",
        reason: "diagnostic-action-confirmation-required",
      },
    ],
  });
});

test("diagnostic action command logs blocked Product Log before delegation", async () => {
  const registeredCommands = [];
  const productEvents = [];
  let openerCalled = false;
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      repositoryOpener: {
        async openPath() {
          openerCalled = true;
          return { ok: true };
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
    },
  });

  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const result = await diagnosticActionHandler({
    actionCode: "apply-skill-to-target",
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
    diagnostic: {
      code: "missing-description",
      severity: "warning",
      category: "quality",
      sourceId: "alpha",
    },
    diagnosticActions: {
      allowedActionCodes: ["apply-skill-to-target"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: ["apply-skill-to-target"],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(openerCalled, false);
  const remediationEvent = productEvents.find(
    (event) => event.code === "remediation.action.blocked",
  );
  assert.deepEqual(remediationEvent, {
    level: "ProductLog",
    code: "remediation.action.blocked",
    actionCode: "apply-skill-to-target",
    diagnosticCode: "missing-description",
    sourceId: "alpha",
    sourceName: "alpha",
    reason: "diagnostic-action-confirmation-required",
  });
  assert.equal(JSON.stringify(remediationEvent).includes("/repo"), false);
});

test("diagnostic action command delegates confirmed apply remediation to apply handler", async () => {
  const registeredCommands = [];
  const productEvents = [];
  const copiedSkills = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    analyzer: {
      async analyzeSourceSkill() {
        return {
          riskLevel: "high",
          diagnostics: [],
        };
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async copySkillToTarget(input) {
          copiedSkills.push(input);
          return {
            ok: true,
            targetPath: "/global/alpha",
          };
        },
      },
    },
  });

  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const result = await diagnosticActionHandler({
    actionCode: "apply-skill-to-target",
    confirmationProvided: true,
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
    target: {
      id: "codex-global",
      scope: "global",
      clientType: "codex",
      targetPath: "/global",
    },
    applyMode: "copy",
    diagnostic: {
      code: "missing-description",
      severity: "warning",
      category: "quality",
      sourceId: "alpha",
    },
    diagnosticActions: {
      allowedActionCodes: ["apply-skill-to-target"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: ["apply-skill-to-target"],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(copiedSkills, [
    {
      sourcePath: "/repo/skills/alpha",
      targetRootPath: "/global",
      skillName: "alpha",
      metadata: {
        sourceSkillId: "alpha",
        sourcePath: "/repo/skills/alpha",
        targetId: "codex-global",
        applyMode: "copy",
      },
    },
  ]);
  assert.equal(
    productEvents.some(
      (event) =>
        event.code === "remediation.action.completed" &&
        event.actionCode === "apply-skill-to-target" &&
        event.commandId === "sponzeySkills.applySkillToGlobalTarget",
    ),
    true,
  );
});

test("diagnostic action command delegates confirmed backup delete remediation to delete handler", async () => {
  const registeredCommands = [];
  const productEvents = [];
  const quickPickCalls = [];
  const deleteCalls = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox() {},
        async showQuickPick(items, options) {
          quickPickCalls.push({ items, options });
          return {
            label: "Delete backup snapshot",
            value: true,
          };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
        async deleteBackup(input) {
          deleteCalls.push(input);
          return {
            ok: true,
            backupPath: input.backupPath,
          };
        },
      },
    },
  });

  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const result = await diagnosticActionHandler({
    actionCode: "delete-backup",
    confirmationProvided: true,
    backup: {
      skillName: "alpha",
      snapshotId: "snapshot-001",
      backupPath: "/repo/backups/alpha/snapshot-001",
    },
    diagnostic: {
      code: "backup-stale",
      severity: "warning",
      category: "backup",
      sourceId: "alpha",
    },
    diagnosticActions: {
      allowedActionCodes: ["delete-backup"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: ["delete-backup"],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(deleteCalls, [
    {
      backupPath: "/repo/backups/alpha/snapshot-001",
    },
  ]);
  assert.equal(quickPickCalls[0].options.placeHolder, "Delete backup snapshot?");
  assert.equal(
    productEvents.some(
      (event) =>
        event.code === "remediation.action.completed" &&
        event.actionCode === "delete-backup" &&
        event.commandId === "sponzeySkills.deleteBackup",
    ),
    true,
  );
});

test("diagnostic analyze-again action refreshes diagnostics tree", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const productEvents = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    analyzer: {
      async analyzeSourceSkill({ source }) {
        return {
          riskLevel: "low",
          diagnostics: [
            {
              code: "external-dependencies-detected",
              severity: "warning",
              message: "Skill declares external dependencies.",
              sourceId: source.id,
            },
          ],
        };
      },
    },
    adapters: {
      logger: {
        async product(event) {
          productEvents.push(event);
        },
      },
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
      },
      hashPort: {
        async hashDirectory() {
          return { ok: true, hash: "source-hash-alpha" };
        },
      },
      analysisStore: {
        async writeAnalysisMetadata() {
          return { ok: true };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const diagnosticsProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.diagnostics",
  )[1];
  const diagnosticActionHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.runDiagnosticAction",
  )[1];
  const initialDiagnostics = await diagnosticsProvider.getChildren();
  const result = await diagnosticActionHandler({
    actionCode: "analyze-again",
    diagnostic: {
      code: "analysis-stale",
      severity: "warning",
      category: "quality",
      sourceId: "alpha",
    },
    diagnosticActions: {
      allowedActionCodes: ["analyze-again"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: [],
    },
  });
  const updatedDiagnostics = await diagnosticsProvider.getChildren();

  assert.equal(result.ok, true);
  assert.deepEqual(
    initialDiagnostics.map((item) => item.label),
    [],
  );
  assert.deepEqual(
    updatedDiagnostics.map((item) => item.label),
    ["warning"],
  );
  assert.equal(
    productEvents.some(
      (event) =>
        event.code === "remediation.action.completed" &&
        event.actionCode === "analyze-again" &&
        event.commandId === "sponzeySkills.analyzeAllSkills",
    ),
    true,
  );
});

test("analyze command dedupes persisted refresh diagnostics and manual refresh preserves them", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  let storedMetadata = null;
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    analyzer: {
      async analyzeSourceSkill() {
        return {
          riskLevel: "low",
          diagnostics: [
            {
              code: "external-dependencies-detected",
              severity: "warning",
              category: "dependency",
              message: "Skill declares external dependencies.",
            },
          ],
        };
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
      },
      hashPort: {
        async hashDirectory({ directoryPath }) {
          assert.equal(directoryPath, "/repo/skills/alpha");
          return { ok: true, hash: "source-hash-alpha" };
        },
      },
      analysisStore: {
        async writeAnalysisMetadata({ repositoryPath, metadata }) {
          assert.equal(repositoryPath, "/repo");
          storedMetadata = metadata;
          return { ok: true };
        },
        async readAnalysisMetadata({ repositoryPath, skillId }) {
          assert.equal(repositoryPath, "/repo");
          assert.equal(skillId, "alpha");
          if (!storedMetadata) {
            return {
              ok: false,
              error: {
                code: "analysis-metadata-not-found",
                severity: "warning",
                message: "Analysis metadata was not found.",
              },
            };
          }

          return {
            ok: true,
            metadata: storedMetadata,
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const diagnosticsProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.diagnostics",
  )[1];
  const analyzeHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.analyzeAllSkills",
  )[1];
  const refreshHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.refreshSkills",
  )[1];

  const analyzeResult = await analyzeHandler();
  const afterAnalyzeItems = await diagnosticLeafItems(diagnosticsProvider);
  const refreshResult = await refreshHandler();
  const afterRefreshItems = await diagnosticLeafItems(diagnosticsProvider);

  assert.equal(analyzeResult.ok, true);
  assert.equal(refreshResult.ok, true);
  assert.deepEqual(
    afterAnalyzeItems.map((item) => [item.label, item.description]),
    [["external-dependencies-detected", "alpha · warning"]],
  );
  assert.deepEqual(
    afterRefreshItems.map((item) => [item.label, item.description]),
    [["external-dependencies-detected", "alpha · warning"]],
  );
});

test("refresh command creates default main repository before scanning when missing", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const initializeCalls = [];
  const scanCalls = [];
  let mainRepositoryPath = "";

  await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        ConfigurationTarget: {
          Global: "global",
        },
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return mainRepositoryPath;
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
            async update(key, value) {
              if (key === "mainRepositoryPath") {
                mainRepositoryPath = value;
              }
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async initializeRepository(input) {
          initializeCalls.push(input);
          return { ok: true };
        },
        async scanSourceSkills(input) {
          scanCalls.push(input);
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: `${input.repositoryPath}/skills/alpha`,
              },
            ],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
    defaultMainRepositoryPath: "/home/test/SponzeySkills",
  });

  const refreshHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.refreshSkills",
  )[1];
  const mainRepositoryProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.mainRepository",
  )[1];
  const result = await refreshHandler();
  const children = await mainRepositoryProvider.getChildren();

  assert.equal(result.ok, true);
  assert.deepEqual(initializeCalls, [
    { repositoryPath: "/home/test/SponzeySkills" },
  ]);
  assert.deepEqual(scanCalls, [
    { repositoryPath: "/home/test/SponzeySkills" },
  ]);
  assert.deepEqual(
    children.map((item) => item.label),
    ["alpha"],
  );
});

test("create skill command collects missing input from VSCode window", async () => {
  const registeredCommands = [];
  const prompts = [];
  const context = { subscriptions: [] };
  const createCalls = [];
  await activate(context, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox(options) {
          prompts.push(options);
          if (options.prompt === "Skill name") {
            return "helper";
          }
          if (options.prompt === "Skill description") {
            return "Use this skill when writing helper code.";
          }
          return undefined;
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async createSourceSkill(input) {
          createCalls.push(input);
          return {
            ok: true,
            source: {
              id: input.skillName,
              name: input.skillName,
              sourcePath: `${input.repositoryPath}/skills/${input.skillName}`,
            },
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const createHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.createSkill",
  )[1];
  const result = await createHandler();

  assert.equal(result.ok, true);
  assert.deepEqual(
    prompts.map((prompt) => prompt.prompt),
    ["Skill name", "Skill description"],
  );
  assert.deepEqual(createCalls, [
    {
      repositoryPath: "/repo",
      skillName: "helper",
      description: "Use this skill when writing helper code.",
      body: "",
    },
  ]);
});

test("set main repository command collects folder and updates VSCode settings", async () => {
  const registeredCommands = [];
  const prompts = [];
  const updates = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showOpenDialog(options) {
          prompts.push(options);
          return [{ fsPath: "/new-repo" }];
        },
        async showInputBox() {
          return undefined;
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        ConfigurationTarget: {
          Global: "global",
        },
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
            async update(key, value, target) {
              updates.push({ key, value, target });
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const setHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.setMainRepository",
  )[1];
  const result = await setHandler();

  assert.equal(result.ok, true);
  assert.equal(prompts.length, 1);
  assert.deepEqual(updates, [
    {
      key: "mainRepositoryPath",
      value: "/new-repo",
      target: "global",
    },
  ]);
});

test("open main repository command creates default repository when missing", async () => {
  const registeredCommands = [];
  const initializeCalls = [];
  const openCalls = [];
  let mainRepositoryPath = "";

  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox() {
          return undefined;
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        ConfigurationTarget: {
          Global: "global",
        },
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return mainRepositoryPath;
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
            async update(key, value) {
              if (key === "mainRepositoryPath") {
                mainRepositoryPath = value;
              }
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async initializeRepository(input) {
          initializeCalls.push(input);
          return { ok: true };
        },
      },
      repositoryOpener: {
        async openPath(input) {
          openCalls.push(input);
          return { ok: true };
        },
      },
    },
    defaultMainRepositoryPath: "/home/test/SponzeySkills",
  });

  const openHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.openMainRepository",
  )[1];
  const result = await openHandler();

  assert.equal(result.ok, true);
  assert.deepEqual(initializeCalls, [
    { repositoryPath: "/home/test/SponzeySkills" },
  ]);
  assert.deepEqual(openCalls, [{ path: "/home/test/SponzeySkills" }]);
});

test("import skill command collects missing input from VSCode window", async () => {
  const registeredCommands = [];
  const prompts = [];
  const importCalls = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showOpenDialog(options) {
          prompts.push(["openDialog", options]);
          return [{ fsPath: "/external/review-helper" }];
        },
        async showInputBox(options) {
          prompts.push(["inputBox", options]);
          return "review-helper";
        },
        async showQuickPick(items, options) {
          prompts.push(["quickPick", { items, options }]);
          return items[0];
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async importSourceSkill(input) {
          importCalls.push(input);
          return {
            ok: true,
            source: {
              id: input.skillName,
              name: input.skillName,
              sourcePath: `${input.repositoryPath}/skills/${input.skillName}`,
            },
          };
        },
        async readSourceSkillFiles() {
          return {
            ok: true,
            files: {
              "SKILL.md": [
                "---",
                "name: review-helper",
                "description: Use this skill when reviewing helper code.",
                "---",
                "",
                "Review helper code.",
              ].join("\n"),
            },
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const importHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.importSkill",
  )[1];
  const result = await importHandler();

  assert.equal(result.ok, true);
  assert.deepEqual(
    prompts.map(([kind]) => kind),
    ["openDialog", "inputBox", "quickPick"],
  );
  assert.deepEqual(importCalls, [
    {
      repositoryPath: "/repo",
      externalSourcePath: "/external/review-helper",
      skillName: "review-helper",
      origin: {
        type: "local-folder",
        path: "/external/review-helper",
      },
    },
  ]);
  assert.equal(result.analysis.riskLevel, "low");
});

test("install skill command creates default main repository before resolving Git when missing", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const prompts = [];
  const importCalls = [];
  const resolverCalls = [];
  const initializeCalls = [];
  const sources = [];
  let mainRepositoryPath = "";

  await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showOpenDialog(options) {
          prompts.push(["openDialog", options]);
          return [{ fsPath: "/main/repo" }];
        },
        async showInputBox(options) {
          prompts.push(["inputBox", options]);
          if (options.prompt === "GitHub URL or local skill folder path") {
            return "https://github.com/acme/review-skill";
          }
          if (options.prompt === "Installed skill name") {
            return "review-skill";
          }
          return undefined;
        },
        async showQuickPick(items, options) {
          prompts.push(["quickPick", { items, options }]);
          return items[0];
        },
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        ConfigurationTarget: {
          Global: "global",
        },
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return mainRepositoryPath;
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
            async update(key, value) {
              if (key === "mainRepositoryPath") {
                mainRepositoryPath = value;
              }
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async initializeRepository(input) {
          initializeCalls.push(input);
          return { ok: true };
        },
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [...sources],
          };
        },
        async importSourceSkill(input) {
          importCalls.push(input);
          const source = {
            id: input.skillName,
            name: input.skillName,
            sourcePath: `${input.repositoryPath}/skills/${input.skillName}`,
          };
          sources.push(source);
          return {
            ok: true,
            source,
          };
        },
        async readSourceSkillFiles() {
          return {
            ok: true,
            files: {
              "SKILL.md": [
                "---",
                "name: review-skill",
                "description: Use this skill when reviewing helper code.",
                "---",
                "",
                "Review helper code.",
              ].join("\n"),
            },
          };
        },
      },
      skillSourceResolver: {
        async resolveInstallSources(input) {
          resolverCalls.push(input);
          return {
            ok: true,
            sources: [
              {
                name: "review-skill",
                sourcePath: "/tmp/review-skill",
                origin: {
                  type: "github",
                  url: input.reference,
                  subPath: "review-skill",
                },
              },
            ],
            async cleanup() {},
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
    defaultMainRepositoryPath: "/home/test/SponzeySkills",
  });

  const installHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.installSkill",
  )[1];
  const mainRepositoryProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.mainRepository",
  )[1];
  const result = await installHandler();
  const mainRepositoryChildren = await mainRepositoryProvider.getChildren();

  assert.equal(result.ok, true);
  assert.deepEqual(
    prompts.map(([kind]) => kind),
    ["inputBox", "quickPick"],
  );
  assert.deepEqual(initializeCalls, [
    { repositoryPath: "/home/test/SponzeySkills" },
  ]);
  assert.deepEqual(resolverCalls, [
    {
      reference: "https://github.com/acme/review-skill",
    },
  ]);
  assert.deepEqual(importCalls, [
    {
      repositoryPath: "/home/test/SponzeySkills",
      externalSourcePath: "/tmp/review-skill",
      skillName: "review-skill",
      origin: {
        type: "github",
        url: "https://github.com/acme/review-skill",
        subPath: "review-skill",
      },
    },
  ]);
  assert.deepEqual(
    mainRepositoryChildren.map((item) => item.label),
    ["review-skill"],
  );
});

test("source mutation commands refresh registered tree provider cache", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const sources = [
    {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
  ];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [...sources],
          };
        },
        async createSourceSkill(input) {
          const source = {
            id: input.skillName,
            name: input.skillName,
            sourcePath: `${input.repositoryPath}/skills/${input.skillName}`,
          };
          sources.push(source);
          return {
            ok: true,
            source,
          };
        },
        async importSourceSkill(input) {
          const source = {
            id: input.skillName,
            name: input.skillName,
            sourcePath: `${input.repositoryPath}/skills/${input.skillName}`,
          };
          sources.push(source);
          return {
            ok: true,
            source,
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          throw new Error("target scan must not run without targets");
        },
      },
    },
  });

  const mainRepositoryProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.mainRepository",
  )[1];
  const createHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.createSkill",
  )[1];
  const importHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.importSkill",
  )[1];
  const initialChildren = await mainRepositoryProvider.getChildren();
  const createResult = await createHandler({
    name: "beta",
    description: "Use this skill when testing tree refresh after create.",
  });
  const afterCreateChildren = await mainRepositoryProvider.getChildren();
  const importResult = await importHandler({
    externalSourcePath: "/external/gamma",
    name: "gamma",
    runAnalysisAfterImport: false,
  });
  const afterImportChildren = await mainRepositoryProvider.getChildren();

  assert.equal(createResult.ok, true);
  assert.equal(importResult.ok, true);
  assert.equal(createResult.source.name, "beta");
  assert.equal(importResult.source.name, "gamma");
  assert.deepEqual(
    initialChildren.map((item) => item.label),
    ["alpha"],
  );
  assert.deepEqual(
    afterCreateChildren.map((item) => item.label),
    ["alpha", "beta"],
  );
  assert.deepEqual(
    afterImportChildren.map((item) => item.label),
    ["alpha", "beta", "gamma"],
  );
});

test("target and transfer mutation commands refresh registered tree provider cache", async () => {
  const registeredCommands = [];
  const registeredTrees = [];
  const sources = [
    {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
  ];
  const appliedSkills = [];
  let getConfigurationCount = 0;
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      EventEmitter: FakeEventEmitter,
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        registerTreeDataProvider(viewId, provider) {
          registeredTrees.push([viewId, provider]);
          return { dispose() {} };
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          getConfigurationCount += 1;
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [globalTarget()];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [...sources],
          };
        },
        async readSourceSkillFiles() {
          return {
            ok: true,
            files: {
              "SKILL.md": [
                "---",
                "name: alpha",
                "description: Use this skill when testing target refresh.",
                "---",
                "",
                "Apply alpha safely.",
              ].join("\n"),
            },
          };
        },
        async copyTargetSkillToMainRepository(input) {
          const source = {
            id: input.skillName,
            name: input.skillName,
            sourcePath: `${input.repositoryPath}/skills/${input.skillName}`,
          };
          sources.push(source);
          return {
            ok: true,
            source,
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            appliedSkills: [...appliedSkills],
            diagnostics: [],
          };
        },
        async copySkillToTarget(input) {
          const targetPath = `${input.targetRootPath}/${input.skillName}`;
          appliedSkills.push({
            name: input.skillName,
            kind: "managed-copy",
            targetPath,
            metadata: {
              sourcePath: input.sourcePath,
              sourceSkillId: input.metadata.sourceSkillId,
            },
          });
          return {
            ok: true,
            targetPath,
          };
        },
        async removeTargetEntry({ targetPath }) {
          const index = appliedSkills.findIndex(
            (appliedSkill) => appliedSkill.targetPath === targetPath,
          );
          if (index >= 0) {
            appliedSkills.splice(index, 1);
          }
          return {
            ok: true,
            removedPath: targetPath,
            removedKind: "directory",
          };
        },
      },
    },
  });

  const mainRepositoryProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.mainRepository",
  )[1];
  const globalProvider = registeredTrees.find(
    ([viewId]) => viewId === "sponzeySkills.globalSkills",
  )[1];
  const applyHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.applySkillToGlobalTarget",
  )[1];
  const removeHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.removeAppliedSkill",
  )[1];
  const copyTransferHandler = registeredCommands.find(
    ([commandId]) =>
      commandId === "sponzeySkills.copyAppliedSkillToMainRepository",
  )[1];
  const initialSkills = await globalProvider.getChildren();
  const applyResult = await applyHandler({
    source: sources[0],
    target: globalTarget(),
    applyMode: "copy",
  });
  const afterApplySkills = await globalProvider.getChildren();
  const removeResult = await removeHandler({
    target: globalTarget(),
    appliedSkill: {
      name: "alpha",
      kind: "managed-copy",
      targetPath: "/global/alpha",
      sourceId: "alpha",
    },
  });
  const afterRemoveSkills = await globalProvider.getChildren();
  const copyTransferResult = await copyTransferHandler({
    target: globalTarget(),
    appliedSkill: {
      name: "external",
      kind: "external",
      targetPath: "/global/external",
      sourceId: null,
    },
    sourceName: "external",
  });
  const mainRepositoryChildren = await mainRepositoryProvider.getChildren();

  assert.equal(applyResult.ok, true);
  assert.equal(removeResult.ok, true);
  assert.equal(copyTransferResult.ok, true);
  assert.equal(applyResult.applied.skillName, "alpha");
  assert.equal(removeResult.removed.skillName, "alpha");
  assert.equal(copyTransferResult.source.name, "external");
  assert.deepEqual(
    initialSkills.map((item) => item.label),
    [],
  );
  assert.deepEqual(
    afterApplySkills.map((item) => item.label),
    ["alpha"],
  );
  assert.deepEqual(
    afterRemoveSkills.map((item) => item.label),
    [],
  );
  assert.deepEqual(
    mainRepositoryChildren.map((item) => item.label),
    ["alpha", "external"],
  );
  assert.equal(getConfigurationCount, 1);
});

test("apply global command collects missing input from VSCode window", async () => {
  const registeredCommands = [];
  const quickPickCalls = [];
  const copyCalls = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox() {
          return undefined;
        },
        async showQuickPick(items, options) {
          quickPickCalls.push({ items, options });
          if (options.placeHolder === "Select source skill") {
            return items[0];
          }
          if (options.placeHolder === "Select global target") {
            return items[0];
          }
          if (options.placeHolder === "Select apply mode") {
            return items.find((item) => item.value === "copy");
          }
          return undefined;
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [globalTarget()];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
        async readSourceSkillFiles() {
          return {
            ok: true,
            files: {
              "SKILL.md": [
                "---",
                "name: alpha",
                "description: Use this skill when applying alpha globally.",
                "---",
                "",
                "Apply alpha globally.",
              ].join("\n"),
            },
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            appliedSkills: [],
            diagnostics: [],
          };
        },
        async copySkillToTarget(input) {
          copyCalls.push(input);
          return {
            ok: true,
            targetPath: "/global/alpha",
          };
        },
      },
    },
  });

  const applyHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.applySkillToGlobalTarget",
  )[1];
  const result = await applyHandler();

  assert.equal(result.ok, true);
  assert.deepEqual(
    quickPickCalls.map((call) => call.options.placeHolder),
    ["Select source skill", "Select apply mode"],
  );
  assert.deepEqual(copyCalls, [
    {
      sourcePath: "/repo/skills/alpha",
      targetRootPath: "/global",
      skillName: "alpha",
      metadata: {
        sourceSkillId: "alpha",
        sourcePath: "/repo/skills/alpha",
        targetId: "global:codex",
        applyMode: "copy",
      },
    },
  ]);
});

test("apply global command uses standard global target without persisting it as configured", async () => {
  const registeredCommands = [];
  const quickPickCalls = [];
  const copyCalls = [];
  let globalTargets = [];

  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox() {
          return undefined;
        },
        async showQuickPick(items, options) {
          quickPickCalls.push({ items, options });
          if (options.placeHolder === "Select source skill") {
            return items[0];
          }
          if (options.placeHolder === "Select global target") {
            return items[0];
          }
          if (options.placeHolder === "Select apply mode") {
            return items.find((item) => item.value === "copy");
          }
          return undefined;
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        ConfigurationTarget: {
          Global: "global",
        },
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return globalTargets;
              }
              return defaultValue;
            },
            async update(key, value, target) {
              assert.equal(target, "global");
              if (key === "globalTargets") {
                globalTargets = value;
              }
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
        async readSourceSkillFiles() {
          return {
            ok: true,
            files: {
              "SKILL.md": [
                "---",
                "name: alpha",
                "description: Use this skill when applying alpha globally.",
                "---",
                "",
                "Apply alpha globally.",
              ].join("\n"),
            },
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            appliedSkills: [],
            diagnostics: [],
          };
        },
        async copySkillToTarget(input) {
          copyCalls.push(input);
          return {
            ok: true,
            targetPath: `${input.targetRootPath}/${input.skillName}`,
          };
        },
      },
    },
    defaultGlobalTargets: [
      {
        clientType: "codex",
        targetPath: "/home/test/.agents/skills",
      },
    ],
  });

  const applyHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.applySkillToGlobalTarget",
  )[1];
  const result = await applyHandler();

  assert.equal(result.ok, true);
  assert.deepEqual(globalTargets, []);
  assert.deepEqual(
    quickPickCalls.map((call) => call.options.placeHolder),
    ["Select source skill", "Select apply mode"],
  );
  assert.deepEqual(copyCalls, [
    {
      sourcePath: "/repo/skills/alpha",
      targetRootPath: "/home/test/.agents/skills",
      skillName: "alpha",
      metadata: {
        sourceSkillId: "alpha",
        sourcePath: "/repo/skills/alpha",
        targetId: "global:codex:/home/test/.agents/skills",
        applyMode: "copy",
      },
    },
  ]);
});

test("remove applied skill command collects missing input from VSCode window", async () => {
  const registeredCommands = [];
  const quickPickCalls = [];
  const removeCalls = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox() {
          return undefined;
        },
        async showQuickPick(items, options) {
          quickPickCalls.push({ items, options });
          return items[0];
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [globalTarget()];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [
              {
                id: "alpha",
                name: "alpha",
                sourcePath: "/repo/skills/alpha",
              },
            ],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            appliedSkills: [
              {
                name: "alpha",
                kind: "managed-copy",
                targetPath: "/global/alpha",
                metadata: {
                  sourcePath: "/repo/skills/alpha",
                  sourceSkillId: "alpha",
                },
              },
            ],
            diagnostics: [],
          };
        },
        async removeTargetEntry(input) {
          removeCalls.push(input);
          return {
            ok: true,
            removedPath: input.targetPath,
            removedKind: "directory",
          };
        },
      },
    },
  });

  const removeHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.removeAppliedSkill",
  )[1];
  const result = await removeHandler();

  assert.equal(result.ok, true);
  assert.deepEqual(
    quickPickCalls.map((call) => call.options.placeHolder),
    [
      "Select target to remove skill from",
      "Select applied target skill to remove",
    ],
  );
  assert.deepEqual(removeCalls, [{ targetPath: "/global/alpha" }]);
});

test("transfer commands collect missing input from VSCode window", async () => {
  const registeredCommands = [];
  const quickPickCalls = [];
  const inputBoxCalls = [];
  const sourceNameResponses = ["external-copy", "external-moved"];
  const copyCalls = [];
  const backupCalls = [];
  const removeCalls = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      window: {
        async showInputBox(options) {
          inputBoxCalls.push(options);
          if (options.prompt === "Source skill name") {
            return sourceNameResponses.shift();
          }
          if (options.prompt === "Backup snapshot ID") {
            return "snapshot-001";
          }
          return undefined;
        },
        async showQuickPick(items, options) {
          quickPickCalls.push({ items, options });
          if (options.placeHolder === "Remove original target entry after copy?") {
            return items.find((item) => item.value === true);
          }
          return items[0];
        },
        async showInformationMessage() {},
        async showWarningMessage() {},
        async showErrorMessage() {},
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              if (key === "globalTargets") {
                return [globalTarget()];
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return {
            ok: true,
            sources: [],
          };
        },
        async copyTargetSkillToMainRepository(input) {
          copyCalls.push(input);
          return {
            ok: true,
            source: {
              id: input.skillName,
              name: input.skillName,
              sourcePath: `${input.repositoryPath}/skills/${input.skillName}`,
            },
          };
        },
        async backupTargetSkillToMainRepository(input) {
          backupCalls.push(input);
          return {
            ok: true,
            backup: {
              skillName: input.skillName,
              snapshotId: input.snapshotId,
              backupPath: `${input.repositoryPath}/backups/${input.skillName}/${input.snapshotId}`,
            },
          };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          return {
            ok: true,
            appliedSkills: [
              {
                name: "external",
                kind: "external",
                targetPath: "/global/external",
                metadata: {},
              },
            ],
            diagnostics: [],
          };
        },
        async removeTargetEntry(input) {
          removeCalls.push(input);
          return {
            ok: true,
            removedPath: input.targetPath,
            removedKind: "directory",
          };
        },
      },
    },
  });

  const copyHandler = registeredCommands.find(
    ([commandId]) =>
      commandId === "sponzeySkills.copyAppliedSkillToMainRepository",
  )[1];
  const backupHandler = registeredCommands.find(
    ([commandId]) =>
      commandId === "sponzeySkills.backupAppliedSkillToMainRepository",
  )[1];
  const moveHandler = registeredCommands.find(
    ([commandId]) =>
      commandId === "sponzeySkills.moveAppliedSkillToMainRepository",
  )[1];
  const copyResult = await copyHandler();
  const backupResult = await backupHandler();
  const moveResult = await moveHandler();

  assert.equal(copyResult.ok, true);
  assert.equal(backupResult.ok, true);
  assert.equal(moveResult.ok, true);
  assert.deepEqual(
    quickPickCalls.map((call) => call.options.placeHolder),
    [
      "Select target to copy skill from",
      "Select applied target skill to copy",
      "Select target to back up skill from",
      "Select applied target skill to back up",
      "Select target to move skill from",
      "Select applied target skill to move",
      "Remove original target entry after copy?",
    ],
  );
  assert.deepEqual(
    inputBoxCalls.map((call) => call.prompt),
    ["Source skill name", "Backup snapshot ID", "Source skill name"],
  );
  assert.deepEqual(
    copyCalls.map((call) => ({
      repositoryPath: call.repositoryPath,
      targetSkillPath: call.targetSkillPath,
      skillName: call.skillName,
      origin: call.origin,
    })),
    [
      {
        repositoryPath: "/repo",
        targetSkillPath: "/global/external",
        skillName: "external-copy",
        origin: {
          type: "target-copy",
          targetId: "global:codex",
          targetPath: "/global/external",
        },
      },
      {
        repositoryPath: "/repo",
        targetSkillPath: "/global/external",
        skillName: "external-moved",
        origin: {
          type: "target-move",
          targetId: "global:codex",
          targetPath: "/global/external",
        },
      },
    ],
  );
  assert.deepEqual(backupCalls, [
    {
      repositoryPath: "/repo",
      targetSkillPath: "/global/external",
      skillName: "external",
      snapshotId: "snapshot-001",
      metadata: {
        type: "target-backup",
        targetId: "global:codex",
        targetPath: "/global/external",
        skillName: "external",
        snapshotId: "snapshot-001",
      },
    },
  ]);
  assert.deepEqual(removeCalls, [{ targetPath: "/global/external" }]);
});

test("backup compare command delegates explicit paths to comparison port", async () => {
  const registeredCommands = [];
  const comparisonCalls = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return { ok: true, sources: [] };
        },
      },
      backupComparisonPort: {
        async compareDirectories(input) {
          comparisonCalls.push(input);
          return {
            ok: true,
            comparison: {
              backupOnlyFiles: ["notes.md"],
              referenceOnlyFiles: [],
              modifiedFiles: ["SKILL.md"],
              unchangedFiles: [],
            },
          };
        },
      },
    },
  });

  const compareHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.compareSkillBackup",
  )[1];
  const result = await compareHandler({
    backupPath: "/repo/backups/alpha/snapshot-001",
    referencePath: "/repo/skills/alpha",
  });

  assert.equal(result.ok, true);
  assert.equal(result.comparison.status, "different");
  assert.deepEqual(comparisonCalls, [
    {
      backupPath: "/repo/backups/alpha/snapshot-001",
      referencePath: "/repo/skills/alpha",
    },
  ]);
});

test("backup restore command delegates explicit input to target and audit ports", async () => {
  const registeredCommands = [];
  const targetRestoreCalls = [];
  const auditCalls = [];
  await activate({ subscriptions: [] }, {
    vscodeApi: {
      commands: {
        registerCommand(commandId, handler) {
          registeredCommands.push([commandId, handler]);
          return { dispose() {} };
        },
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration(section) {
          assert.equal(section, "sponzeySkills");
          return {
            get(key, defaultValue) {
              if (key === "mainRepositoryPath") {
                return "/repo";
              }
              return defaultValue;
            },
          };
        },
      },
    },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return { ok: true, sources: [] };
        },
      },
      targetStore: {
        async restoreBackupToTarget(input) {
          targetRestoreCalls.push(input);
          return {
            ok: true,
            targetPath: "/global/alpha",
            metadataPath: "/global/alpha/.sponzey-applied.json",
          };
        },
      },
      auditStore: {
        async appendRecord(input) {
          auditCalls.push(input);
          return { ok: true, auditPath: "/repo/.sponzey/transfer-log.json" };
        },
      },
    },
  });

  const restoreHandler = registeredCommands.find(
    ([commandId]) => commandId === "sponzeySkills.restoreBackupToTarget",
  )[1];
  const result = await restoreHandler({
    backup: {
      skillName: "alpha",
      snapshotId: "snapshot-001",
      backupPath: "/repo/backups/alpha/snapshot-001",
    },
    target: {
      id: "global:codex",
      clientType: "codex",
      targetPath: "/global",
    },
    overwriteConfirmed: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(targetRestoreCalls, [
    {
      backupPath: "/repo/backups/alpha/snapshot-001",
      targetRootPath: "/global",
      skillName: "alpha",
      overwrite: true,
      metadata: {
        sourceSkillId: "alpha",
        sourcePath: "/repo/backups/alpha/snapshot-001",
        applyMode: "copy",
        restoredFromBackup: true,
        backupSnapshotId: "snapshot-001",
        targetId: "global:codex",
        clientType: "codex",
      },
    },
  ]);
  assert.deepEqual(auditCalls[0], {
    repositoryPath: "/repo",
    record: {
      operation: "backup-restore",
      code: "skill.backup.restore.completed",
      skillName: "alpha",
      targetId: "global:codex",
      clientType: "codex",
      snapshotId: "snapshot-001",
      overwrite: true,
    },
  });
});

class FakeEventEmitter {
  constructor() {
    this.event = () => ({ dispose() {} });
  }

  fire() {}
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function watcherDisposable(disposeCalls, type, pattern) {
  return {
    dispose() {
      disposeCalls.push([type, pattern]);
    },
  };
}

async function diagnosticLeafItems(provider) {
  const severities = await provider.getChildren();
  const categories = await provider.getChildren(severities[0]);
  return provider.getChildren(categories[0]);
}

function globalTarget() {
  return {
    id: "global:codex",
    clientType: "codex",
    scope: "global",
    targetPath: "/global",
  };
}
