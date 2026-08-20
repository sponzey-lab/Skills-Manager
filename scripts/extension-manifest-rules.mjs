import path from "node:path";

const allowedTreeItemContextValues = new Set([
  "sponzeySkillSource",
  "sponzeySkillTarget",
  "sponzeyAppliedSkill",
  "sponzeyGlobalEnrollment",
  "sponzeySkillBackup",
  "sponzeyDiagnostic",
  "sponzeyDiagnosticWithSource",
]);

const requiredConfigurationProperties = new Map([
  ["sponzeySkills.mainRepositoryPath", "string"],
  ["sponzeySkills.enabledClients", "array"],
  ["sponzeySkills.globalTargets", "array"],
  ["sponzeySkills.projectTargetPatterns", "array"],
  ["sponzeySkills.defaultApplyMode", "string"],
  ["sponzeySkills.riskPolicy", "object"],
  ["sponzeySkills.backupPolicy", "object"],
  ["sponzeySkills.loggingPolicy", "object"],
]);

export async function validateExtensionManifest({
  packageJson,
  fileExists,
} = {}) {
  const diagnostics = [];

  if (!packageJson || typeof packageJson !== "object") {
    return {
      ok: false,
      diagnostics: [
        diagnostic({
          code: "manifest-invalid-json",
          message: "Extension manifest must be a JSON object.",
        }),
      ],
    };
  }

  const mainEntry = normalizeRelativeManifestPath(packageJson.main);
  if (!mainEntry) {
    diagnostics.push(
      diagnostic({
        code: "manifest-main-entrypoint-missing",
        message: "Extension manifest must declare a relative main entrypoint.",
      }),
    );
  } else if (typeof fileExists === "function" && !(await fileExists(mainEntry))) {
    diagnostics.push(
      diagnostic({
        code: "manifest-main-entrypoint-missing",
        message: "Extension manifest main entrypoint file does not exist.",
        path: mainEntry,
      }),
    );
  }

  if (!hasText(packageJson.engines?.vscode)) {
    diagnostics.push(
      diagnostic({
        code: "manifest-missing-vscode-engine",
        message: "Extension manifest must declare engines.vscode.",
      }),
    );
  }

  validatePackagingMetadata({ packageJson, diagnostics });
  const commandIds = validateCommands({ packageJson, diagnostics });
  const viewIds = await validateViews({ packageJson, diagnostics, fileExists });
  validateViewItemMenus({
    packageJson,
    diagnostics,
    commandIds,
    viewIds,
  });
  validateConfiguration({ packageJson, diagnostics });

  return {
    ok: diagnostics.length === 0,
    diagnostics,
  };
}

function validatePackagingMetadata({ packageJson, diagnostics }) {
  if (!hasText(packageJson.displayName)) {
    diagnostics.push(
      diagnostic({
        code: "manifest-display-name-missing",
        message: "Extension manifest must declare displayName.",
      }),
    );
  }

  if (!nonEmptyStringArray(packageJson.categories)) {
    diagnostics.push(
      diagnostic({
        code: "manifest-categories-missing",
        message: "Extension manifest must declare at least one category.",
      }),
    );
  }

  if (!nonEmptyStringArray(packageJson.keywords)) {
    diagnostics.push(
      diagnostic({
        code: "manifest-keywords-missing",
        message: "Extension manifest must declare release keywords.",
      }),
    );
  }

  if (!nonEmptyStringArray(packageJson.extensionKind)) {
    diagnostics.push(
      diagnostic({
        code: "manifest-extension-kind-missing",
        message: "Extension manifest must declare extensionKind.",
      }),
    );
  }
}

function validateConfiguration({ packageJson, diagnostics }) {
  const configuration = packageJson.contributes?.configuration;
  const properties = configuration?.properties;

  if (!configuration || !properties || typeof properties !== "object") {
    diagnostics.push(
      diagnostic({
        code: "manifest-configuration-missing",
        message:
          "Extension manifest must contribute configuration properties for persisted sponzeySkills settings.",
      }),
    );
    return;
  }

  for (const [propertyName, expectedType] of requiredConfigurationProperties) {
    const property = properties[propertyName];
    if (!property) {
      diagnostics.push(
        diagnostic({
          code: "manifest-configuration-property-missing",
          message: "Extension manifest must declare every persisted setting.",
          property: propertyName,
        }),
      );
      continue;
    }

    if (!propertyHasType(property, expectedType)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-configuration-property-type-invalid",
          message: "Extension manifest persisted setting has an invalid type.",
          property: propertyName,
          expectedType,
        }),
      );
    }
  }
}

function validateCommands({ packageJson, diagnostics }) {
  const commands = packageJson.contributes?.commands ?? [];
  const commandIds = new Set();

  if (!Array.isArray(commands) || commands.length === 0) {
    diagnostics.push(
      diagnostic({
        code: "manifest-commands-missing",
        message: "Extension manifest must contribute at least one command.",
      }),
    );
    return commandIds;
  }

  for (const command of commands) {
    if (!hasText(command?.command) || !hasText(command?.title)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-command-invalid",
          message: "Each contributed command must have command and title.",
        }),
      );
      continue;
    }

    if (commandIds.has(command.command)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-command-duplicate",
          message: "Contributed command ids must be unique.",
          command: command.command,
        }),
      );
      continue;
    }

    commandIds.add(command.command);
  }

  return commandIds;
}

async function validateViews({ packageJson, diagnostics, fileExists }) {
  const activitybarContainers =
    packageJson.contributes?.viewsContainers?.activitybar ?? [];
  const containerIds = new Set();
  const viewIds = new Set();

  if (!Array.isArray(activitybarContainers) || activitybarContainers.length === 0) {
    diagnostics.push(
      diagnostic({
        code: "manifest-view-container-missing",
        message: "Extension manifest must contribute an activitybar view container.",
      }),
    );
  } else {
    for (const container of activitybarContainers) {
      if (!hasText(container?.id) || !hasText(container?.title)) {
        diagnostics.push(
          diagnostic({
            code: "manifest-view-container-invalid",
            message: "Each activitybar view container must have id and title.",
          }),
        );
        continue;
      }

      const iconPath = normalizeRelativeManifestPath(container.icon);
      if (!iconPath) {
        diagnostics.push(
          diagnostic({
            code: "manifest-view-container-icon-missing",
            message: "Each activitybar view container must have a relative icon path.",
            viewContainer: container.id,
          }),
        );
        continue;
      }

      if (typeof fileExists === "function" && !(await fileExists(iconPath))) {
        diagnostics.push(
          diagnostic({
            code: "manifest-view-container-icon-missing",
            message: "Activitybar view container icon file does not exist.",
            viewContainer: container.id,
            path: iconPath,
          }),
        );
        continue;
      }

      if (path.extname(iconPath).toLowerCase() !== ".svg") {
        diagnostics.push(
          diagnostic({
            code: "manifest-view-container-icon-not-svg",
            message:
              "Activitybar view container icons must be SVG files so VSCode can render them as theme-aware monochrome icons.",
            viewContainer: container.id,
            path: iconPath,
          }),
        );
        continue;
      }

      if (containerIds.has(container.id)) {
        diagnostics.push(
          diagnostic({
            code: "manifest-view-container-duplicate",
            message: "Activitybar view container ids must be unique.",
            viewContainer: container.id,
          }),
        );
        continue;
      }

      containerIds.add(container.id);
    }
  }

  const viewsByContainer = packageJson.contributes?.views ?? {};
  for (const [containerId, views] of Object.entries(viewsByContainer)) {
    if (!containerIds.has(containerId)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-view-container-unknown",
          message: "Views must reference a contributed view container.",
          viewContainer: containerId,
        }),
      );
    }

    if (!Array.isArray(views) || views.length === 0) {
      diagnostics.push(
        diagnostic({
          code: "manifest-views-missing",
          message: "Each view container must declare at least one view.",
          viewContainer: containerId,
        }),
      );
      continue;
    }

    for (const view of views) {
      if (!hasText(view?.id) || !hasText(view?.name)) {
        diagnostics.push(
          diagnostic({
            code: "manifest-view-invalid",
            message: "Each contributed view must have id and name.",
          }),
        );
        continue;
      }

      if (viewIds.has(view.id)) {
        diagnostics.push(
          diagnostic({
            code: "manifest-view-duplicate",
            message: "Contributed view ids must be unique.",
            view: view.id,
          }),
        );
        continue;
      }

      viewIds.add(view.id);
    }
  }

  return viewIds;
}

function validateViewItemMenus({
  packageJson,
  diagnostics,
  commandIds,
  viewIds,
}) {
  const viewItemMenus = packageJson.contributes?.menus?.["view/item/context"] ?? [];

  if (!Array.isArray(viewItemMenus) || viewItemMenus.length === 0) {
    diagnostics.push(
      diagnostic({
        code: "manifest-view-item-menus-missing",
        message: "Extension manifest must contribute tree item context menus.",
      }),
    );
    return;
  }

  for (const menu of viewItemMenus) {
    if (!commandIds.has(menu?.command)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-menu-command-unknown",
          message: "Tree item context menu must reference a contributed command.",
          command: menu?.command,
        }),
      );
    }

    const viewId = viewIdFromWhenClause(menu?.when);
    if (!viewId || !viewIds.has(viewId)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-menu-view-unknown",
          message: "Tree item context menu must reference a contributed view.",
          view: viewId,
        }),
      );
    }

    const viewItem = viewItemFromWhenClause(menu?.when);
    if (!viewItem || !allowedTreeItemContextValues.has(viewItem)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-menu-view-item-unknown",
          message: "Tree item context menu must reference an allowed viewItem.",
          viewItem,
        }),
      );
    }

    if (!hasText(menu?.group)) {
      diagnostics.push(
        diagnostic({
          code: "manifest-menu-group-missing",
          message: "Tree item context menu must declare a group.",
          command: menu?.command,
        }),
      );
    }
  }
}

function normalizeRelativeManifestPath(value) {
  if (!hasText(value) || path.isAbsolute(value)) {
    return null;
  }

  return value.replace(/^\.\//, "");
}

function viewIdFromWhenClause(whenClause) {
  return whenClause?.match(/(?:^|\s)view\s*==\s*([^\s&]+)/)?.[1] ?? null;
}

function viewItemFromWhenClause(whenClause) {
  return whenClause?.match(/(?:^|\s)viewItem\s*==\s*([^\s&]+)/)?.[1] ?? null;
}

function propertyHasType(property, expectedType) {
  if (property?.type === expectedType) {
    return true;
  }

  return Array.isArray(property?.type) && property.type.includes(expectedType);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.some(hasText);
}

function diagnostic(fields) {
  return {
    severity: "error",
    ...fields,
  };
}
