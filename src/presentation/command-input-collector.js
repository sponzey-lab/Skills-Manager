const DEFAULT_PROJECT_TARGET_PATTERNS = Object.freeze({
  codex: ".agents/skills",
  claude: ".claude/skills",
});

const SUPPORTED_DIAGNOSTIC_ACTION_CHOICES = Object.freeze([
  {
    code: "open-skill-md",
    label: "Open SKILL.md",
    description: "Open the source skill file.",
  },
  {
    code: "analyze-again",
    label: "Analyze Again",
    description: "Run skill analysis again.",
  },
  {
    code: "compare-backup",
    label: "Compare Backup",
    description: "Compare a backup snapshot with a reference folder.",
  },
  {
    code: "restore-backup",
    label: "Restore Backup",
    description: "Restore a backup snapshot to a selected target.",
  },
  {
    code: "delete-backup",
    label: "Delete Backup",
    description: "Delete a backup snapshot.",
  },
  {
    code: "set-main-repository",
    label: "Set Main Repository",
    description: "Choose the Main Repository path.",
  },
  {
    code: "apply-skill-to-target",
    label: "Apply Skill to Target",
    description: "Apply this skill after explicit confirmation.",
  },
]);

export async function collectCommandInput({
  commandId,
  input = {},
  window,
  loadReadModel,
  defaultGlobalTargets = [],
}) {
  if (commandId === "sponzeySkills.setMainRepository") {
    return collectSetMainRepositoryInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.removeMainRepository") {
    return collectRemoveMainRepositoryInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.addGlobalRepository") {
    return collectAddGlobalRepositoryInput({
      commandId,
      input,
      window,
      defaultGlobalTargets,
    });
  }

  if (commandId === "sponzeySkills.removeGlobalRepository") {
    return collectRemoveGlobalRepositoryInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.addProjectRepository") {
    return collectAddProjectRepositoryInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.removeProjectRepository") {
    return collectRemoveProjectRepositoryInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (
    commandId === "sponzeySkills.openSourceFolder" ||
    commandId === "sponzeySkills.openTargetFolder" ||
    commandId === "sponzeySkills.openSkillMd"
  ) {
    return collectOpenCommandInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.showSkillDetail") {
    return collectSkillDetailInput({ commandId, input, window, loadReadModel });
  }

  if (commandId === "sponzeySkills.updateAppliedCopyFromSource") {
    return collectUpdateAppliedCopyInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.convertAppliedSkillMode") {
    return collectConvertAppliedSkillModeInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.renameSourceSkill") {
    return collectRenameSourceSkillInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.deleteSourceSkill") {
    return collectDeleteSourceSkillInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.removeGlobalSkillEnrollment") {
    return collectRemoveGlobalSkillEnrollmentInput({ commandId, input, window, loadReadModel });
  }

  if (commandId === "sponzeySkills.exportSourceSkill") {
    return collectExportSourceSkillInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.importSkillArchive") {
    return collectImportSkillArchiveInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.compareSkillBackup") {
    return collectCompareBackupInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.restoreBackupToTarget") {
    return collectRestoreBackupInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.promoteBackupToSkillSource") {
    return collectPromoteBackupInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.deleteBackup") {
    return collectDeleteBackupInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.createSkill") {
    return collectCreateSkillInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.importSkill") {
    return collectImportSkillInput({ commandId, input, window });
  }

  if (commandId === "sponzeySkills.installSkill") {
    return collectInstallSkillInput({ commandId, input, window });
  }

  if (
    commandId === "sponzeySkills.applySkillToGlobalTarget" ||
    commandId === "sponzeySkills.applySkillToProjectTarget"
  ) {
    return collectApplySkillInput({
      commandId,
      input,
      window,
      loadReadModel,
      targetScope:
        commandId === "sponzeySkills.applySkillToProjectTarget"
          ? "project"
          : "global",
    });
  }

  if (commandId === "sponzeySkills.removeAppliedSkill") {
    return collectRemoveAppliedSkillInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (isTransferCommand(commandId)) {
    return collectTransferAppliedSkillInput({
      commandId,
      input,
      window,
      loadReadModel,
    });
  }

  if (commandId === "sponzeySkills.runDiagnosticAction") {
    return collectDiagnosticActionInput({ commandId, input, window });
  }

  return {
    ok: true,
    input,
  };
}

export function wrapCommandHandlersWithInputCollection({
  handlers,
  window,
  loadReadModel,
  defaultGlobalTargets = [],
}) {
  return Object.fromEntries(
    Object.entries(handlers).map(([commandId, handler]) => [
      commandId,
      async (input) => {
        const collected = await collectCommandInput({
          commandId,
          input,
          window,
          loadReadModel,
          defaultGlobalTargets,
        });

        if (!collected.ok) {
          return collected.result;
        }

        return handler(collected.input);
      },
    ]),
  );
}

async function collectSetMainRepositoryInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.mainRepositoryPath)) {
    const mainRepositoryPath = await showFolderOpenDialog({
      window,
      openLabel: "Select Main Repository",
    });

    if (mainRepositoryPath === undefined) {
      return cancelled(commandId);
    }

    nextInput.mainRepositoryPath = mainRepositoryPath;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectRemoveMainRepositoryInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (nextInput.confirmationProvided !== true) {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Remove main repository setting", value: true },
        { label: "Cancel", value: false },
      ],
      placeHolder: "Remove the main repository setting?",
    });

    if (choice === undefined || choice.value !== true) {
      return cancelled(commandId);
    }

    nextInput.confirmationProvided = true;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

function globalRepositoryClientChoices() {
  return [
    {
      label: "codex",
      description: "~/.agents/skills",
      value: "codex",
    },
    {
      label: "claude",
      description: "~/.claude/skills",
      value: "claude",
    },
    {
      label: "all",
      description: "codex + claude",
      value: "all",
    },
    {
      label: "custom",
      description: "Select a custom global repository folder",
      value: "custom",
    },
  ];
}

function projectRepositoryClientChoices() {
  return [
    {
      label: "codex",
      description: DEFAULT_PROJECT_TARGET_PATTERNS.codex,
      value: "codex",
    },
    {
      label: "claude",
      description: DEFAULT_PROJECT_TARGET_PATTERNS.claude,
      value: "claude",
    },
    {
      label: "all",
      description: "codex + claude",
      value: "all",
    },
    {
      label: "custom",
      description: "Enter a custom project repository path",
      value: "custom",
    },
  ];
}

function defaultGlobalRepositoryTargets({ defaultGlobalTargets, clientTypes }) {
  return clientTypes
    .map((clientType) =>
      (defaultGlobalTargets ?? []).find(
        (target) =>
          target?.clientType === clientType && hasText(target?.targetPath),
      ),
    )
    .filter(Boolean)
    .map((target) => ({
      targetPath: target.targetPath,
      clientType: target.clientType,
    }));
}

async function collectAddGlobalRepositoryInput({
  commandId,
  input,
  window,
  defaultGlobalTargets = [],
}) {
  const nextInput = { ...input };

  if (Array.isArray(nextInput.targets) && nextInput.targets.length > 0) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  if (hasText(nextInput.targetPath) && hasText(nextInput.clientType)) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  let selectedClient = nextInput.clientType;
  if (!hasText(selectedClient)) {
    const choice = await showQuickPick({
      window,
      items: globalRepositoryClientChoices(),
      placeHolder: "Select global repository client",
    });

    if (choice === undefined) {
      return cancelled(commandId);
    }

    selectedClient = choice.value;
  }

  if (selectedClient === "all") {
    const targets = defaultGlobalRepositoryTargets({
      defaultGlobalTargets,
      clientTypes: ["codex", "claude"],
    });

    if (targets.length !== 2) {
      return unavailable(
        commandId,
        "Default Codex and Claude global repositories are unavailable.",
      );
    }

    nextInput.targets = targets;
    delete nextInput.targetPath;
    delete nextInput.clientType;
    return {
      ok: true,
      input: nextInput,
    };
  }

  if (selectedClient === "codex" || selectedClient === "claude") {
    nextInput.clientType = selectedClient;
    if (!hasText(nextInput.targetPath)) {
      const defaultTarget = defaultGlobalRepositoryTargets({
        defaultGlobalTargets,
        clientTypes: [selectedClient],
      })[0];
      if (defaultTarget) {
        nextInput.targetPath = defaultTarget.targetPath;
      }
    }
  } else if (selectedClient === "custom") {
    nextInput.clientType = "custom";
  }

  if (!hasText(nextInput.targetPath)) {
    const targetPath = await showFolderOpenDialog({
      window,
      openLabel: "Select Global Repository",
    });

    if (targetPath === undefined) {
      return cancelled(commandId);
    }

    nextInput.targetPath = targetPath;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectRemoveGlobalRepositoryInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const nextInput = { ...input };

  if (!hasText(nextInput.targetId)) {
    const readModel = await loadApplyReadModel({ commandId, loadReadModel });

    if (readModel?.ok === false) {
      return readModel;
    }

    const targetChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: globalRepositoryChoices(readModel.value),
      placeHolder: "Select global repository to unregister",
      unavailableMessage: "No global repositories are available.",
    });

    if (!targetChoice.ok) {
      return targetChoice;
    }

    nextInput.targetId = targetChoice.choice.value.targetId;
  }

  return confirmRepositoryUnregister({
    commandId,
    input: nextInput,
    window,
    repositoryScope: "global",
  });
}

async function collectAddProjectRepositoryInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (Array.isArray(nextInput.targetPatterns) && nextInput.targetPatterns.length > 0) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  if (hasText(nextInput.targetPattern)) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  const choice = await showQuickPick({
    window,
    items: projectRepositoryClientChoices(),
    placeHolder: "Select project repository client",
  });

  if (choice === undefined) {
    return cancelled(commandId);
  }

  if (choice.value === "all") {
    nextInput.targetPatterns = [
      DEFAULT_PROJECT_TARGET_PATTERNS.codex,
      DEFAULT_PROJECT_TARGET_PATTERNS.claude,
    ];
    return {
      ok: true,
      input: nextInput,
    };
  }

  if (choice.value === "codex" || choice.value === "claude") {
    nextInput.targetPattern = DEFAULT_PROJECT_TARGET_PATTERNS[choice.value];
    return {
      ok: true,
      input: nextInput,
    };
  }

  if (choice.value === "custom") {
    const targetPattern = await showInputBox({
      window,
      prompt: "Project repository relative path",
      placeHolder: ".agents/skills",
    });

    if (targetPattern === undefined) {
      return cancelled(commandId);
    }

    nextInput.targetPattern = targetPattern;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectRemoveProjectRepositoryInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const nextInput = { ...input };

  if (!hasText(nextInput.targetPattern)) {
    const readModel = await loadApplyReadModel({ commandId, loadReadModel });

    if (readModel?.ok === false) {
      return readModel;
    }

    const targetChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: projectRepositoryChoices(readModel.value),
      placeHolder: "Select project repository pattern to unregister",
      unavailableMessage: "No project repositories are available.",
    });

    if (!targetChoice.ok) {
      return targetChoice;
    }

    nextInput.targetPattern = targetChoice.choice.value.targetPattern;
  }

  return confirmRepositoryUnregister({
    commandId,
    input: nextInput,
    window,
    repositoryScope: "project",
  });
}

async function confirmRepositoryUnregister({
  commandId,
  input,
  window,
  repositoryScope,
}) {
  if (input.confirmationProvided === true) {
    return {
      ok: true,
      input,
    };
  }

  const choice = await showQuickPick({
    window,
    items: [
      {
        label: `Unregister ${repositoryScope} repository (keep skills on disk)`,
        value: true,
      },
      { label: "Cancel", value: false },
    ],
    placeHolder: `Unregister this ${repositoryScope} repository? Skills will remain on disk.`,
  });

  if (choice === undefined || choice.value !== true) {
    return cancelled(commandId);
  }

  input.confirmationProvided = true;
  return {
    ok: true,
    input,
  };
}

async function collectOpenCommandInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const nextInput = {
    ...input,
    openKind:
      commandId === "sponzeySkills.openSkillMd"
        ? "skillMd"
        : commandId === "sponzeySkills.openTargetFolder"
          ? "targetFolder"
          : "sourceFolder",
  };

  if (hasText(nextInput.path)) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  if (nextInput.openKind === "targetFolder") {
    return collectAppliedSkillSelectionInput({
      commandId,
      input: nextInput,
      window,
      loadReadModel,
    });
  }

  return collectSourceSelectionInput({
    commandId,
    input: nextInput,
    window,
    loadReadModel,
  });
}

async function collectSkillDetailInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const nextInput = { ...input };

  if (
    hasSource(nextInput.source) ||
    hasAppliedSkill(nextInput.appliedSkill) ||
    hasBackup(nextInput.backup) ||
    hasDiagnostic(nextInput.diagnostic)
  ) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  const readModel = await loadApplyReadModel({ commandId, loadReadModel });
  if (readModel?.ok === false) {
    return readModel;
  }

  const detailChoice = await chooseRequiredQuickPick({
    commandId,
    window,
    items: skillDetailChoices(readModel.value),
    placeHolder: "Select skill to inspect",
    unavailableMessage: "No skills are available.",
  });

  if (!detailChoice.ok) {
    return detailChoice;
  }

  Object.assign(nextInput, detailChoice.choice.value);

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectDiagnosticActionInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.actionCode)) {
    const actionChoices = supportedDiagnosticActionChoices(
      nextInput.diagnosticActions,
    );
    if (actionChoices.length === 0) {
      return unavailable(
        commandId,
        "No supported diagnostic actions are available.",
      );
    }

    const actionChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: actionChoices,
      placeHolder: "Select diagnostic action",
      unavailableMessage: "No supported diagnostic actions are available.",
    });

    if (!actionChoice.ok) {
      return actionChoice;
    }

    nextInput.actionCode = actionChoice.choice.value;
  }

  if (
    diagnosticActionRequiresConfirmation({
      actionCode: nextInput.actionCode,
      diagnosticActions: nextInput.diagnosticActions,
    }) &&
    nextInput.confirmationProvided !== true
  ) {
    const confirmationItems = diagnosticActionConfirmationItems(
      nextInput.actionCode,
    );
    const confirmationChoice = await showQuickPick({
      window,
      items: confirmationItems,
      placeHolder: "Confirm diagnostic action",
    });

    if (confirmationChoice === undefined || confirmationChoice.value !== true) {
      return cancelled(commandId);
    }

    nextInput.confirmationProvided = true;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

function diagnosticActionConfirmationItems(actionCode) {
  if (actionCode === "apply-skill-to-target") {
    return [
      {
        label: "Confirm Apply",
        description: "Apply this skill to a selected target.",
        value: true,
      },
      {
        label: "Cancel",
        value: false,
      },
    ];
  }

  if (actionCode === "restore-backup") {
    return [
      {
        label: "Confirm Restore Backup",
        description: "Restore this backup snapshot to a selected target.",
        value: true,
      },
      {
        label: "Cancel",
        value: false,
      },
    ];
  }

  if (actionCode === "delete-backup") {
    return [
      {
        label: "Confirm Delete Backup",
        description: "Delete this backup snapshot.",
        value: true,
      },
      {
        label: "Cancel",
        value: false,
      },
    ];
  }

  return [
    {
      label: "Confirm Action",
      description: "Run this diagnostic action.",
      value: true,
    },
    {
      label: "Cancel",
      value: false,
    },
  ];
}

async function collectUpdateAppliedCopyInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const selected = await collectAppliedSkillWithSourceInput({
    commandId,
    input,
    window,
    loadReadModel,
  });

  if (!selected.ok) {
    return selected;
  }

  const nextInput = selected.input;

  if (
    ["Target Changed", "Both Changed"].includes(nextInput.appliedSkill?.syncStatus) &&
    nextInput.confirmationProvided !== true
  ) {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Update and replace target changes", value: true },
        { label: "Cancel", value: false },
      ],
      placeHolder: "Target has local changes. Continue update?",
    });

    if (choice === undefined || choice.value !== true) {
      return cancelled(commandId);
    }

    nextInput.confirmationProvided = true;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectConvertAppliedSkillModeInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const selected = await collectAppliedSkillWithSourceInput({
    commandId,
    input,
    window,
    loadReadModel,
  });

  if (!selected.ok) {
    return selected;
  }

  const nextInput = selected.input;

  if (!hasApplyMode(nextInput.targetMode)) {
    const modeChoice = await showQuickPick({
      window,
      items: [
        { label: "copy", value: "copy" },
        { label: "symlink", value: "symlink" },
      ],
      placeHolder: "Select target apply mode",
    });

    if (modeChoice === undefined) {
      return cancelled(commandId);
    }

    nextInput.targetMode = modeChoice.value;
  }

  if (
    nextInput.targetMode === "symlink" &&
    ["Target Changed", "Both Changed"].includes(nextInput.appliedSkill?.syncStatus) &&
    nextInput.confirmationProvided !== true
  ) {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Convert and replace target changes", value: true },
        { label: "Cancel", value: false },
      ],
      placeHolder: "Target has local changes. Continue conversion?",
    });

    if (choice === undefined || choice.value !== true) {
      return cancelled(commandId);
    }

    nextInput.confirmationProvided = true;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectRenameSourceSkillInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const selected = await collectSourceSelectionInput({
    commandId,
    input,
    window,
    loadReadModel,
  });

  if (!selected.ok) {
    return selected;
  }

  const nextInput = selected.input;
  nextInput.oldName = nextInput.oldName ?? nextInput.source.name;

  if (!hasText(nextInput.newName)) {
    const newName = await showInputBox({
      window,
      prompt: "New source skill name",
      placeHolder: "new-skill-name",
      value: nextInput.source.name,
    });

    if (newName === undefined) {
      return cancelled(commandId);
    }

    nextInput.newName = newName;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectDeleteSourceSkillInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const selected = await collectSourceSelectionInput({
    commandId,
    input,
    window,
    loadReadModel,
  });

  if (!selected.ok) {
    return selected;
  }

  const nextInput = selected.input;
  nextInput.skillName = nextInput.skillName ?? nextInput.source.name;

  if (nextInput.cleanupManagedPlacements === undefined) {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Delete source and clean up managed targets", value: "cleanup" },
        { label: "Delete source only (leave targets unchanged)", value: "source-only" },
        { label: "Cancel", value: "cancel" },
      ],
      placeHolder: `Delete source '${nextInput.skillName}'? Managed targets will be checked before deletion.`,
    });

    if (choice === undefined || choice.value === "cancel") {
      return cancelled(commandId);
    }

    nextInput.cleanupManagedPlacements = choice.value === "cleanup";
    nextInput.impactConfirmed = true;
  }

  if (nextInput.confirmationProvided !== true) {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Delete source skill", value: true },
        { label: "Cancel", value: false },
      ],
      placeHolder: `Delete source skill '${nextInput.skillName}'?`,
    });

    if (choice === undefined || choice.value !== true) {
      return cancelled(commandId);
    }

    nextInput.confirmationProvided = true;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectRemoveGlobalSkillEnrollmentInput({ commandId, input, window, loadReadModel }) {
  const selected = await collectSourceSelectionInput({ commandId, input, window, loadReadModel });
  if (!selected.ok) return selected;
  const sourceSkillId = selected.input.source?.id;
  if (!hasText(sourceSkillId)) return unavailable(commandId, "Global enrollment source is unavailable.");
  if (selected.input.confirmationProvided !== true) {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Remove Global enrollment and managed Global placements", value: true },
        { label: "Cancel", value: false },
      ],
      placeHolder: `Remove Global enrollment for '${selected.input.source.name}'?`,
    });
    if (choice === undefined || choice.value !== true) return cancelled(commandId);
  }
  return { ok: true, input: { sourceSkillId, confirmationProvided: true } };
}

async function collectExportSourceSkillInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const selected = await collectSourceSelectionInput({
    commandId,
    input,
    window,
    loadReadModel,
  });

  if (!selected.ok) {
    return selected;
  }

  const nextInput = selected.input;
  nextInput.skillName = nextInput.skillName ?? nextInput.source.name;

  if (!hasText(nextInput.archivePath)) {
    const archivePath = await showInputBox({
      window,
      prompt: "Export archive path",
      placeHolder: "/path/to/skill.sponzey-skill.json",
      value: `${nextInput.skillName}.sponzey-skill.json`,
    });

    if (archivePath === undefined) {
      return cancelled(commandId);
    }

    nextInput.archivePath = archivePath;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectImportSkillArchiveInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.archivePath)) {
    const archivePath = await showFileOpenDialog({
      window,
      openLabel: "Select Skill Archive",
    });

    if (archivePath === undefined) {
      return cancelled(commandId);
    }

    nextInput.archivePath = archivePath;
  }

  if (!hasText(nextInput.skillName)) {
    const skillName = await showInputBox({
      window,
      prompt: "Imported archive skill name",
      placeHolder: "skill-name",
      value: archiveNameToSkillName(nextInput.archivePath),
    });

    if (skillName === undefined) {
      return cancelled(commandId);
    }

    nextInput.skillName = skillName;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectPromoteBackupInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.backupPath) && !hasText(nextInput.backup?.backupPath)) {
    const backupPath = await showFolderOpenDialog({
      window,
      openLabel: "Select Backup Snapshot",
    });

    if (backupPath === undefined) {
      return cancelled(commandId);
    }

    nextInput.backupPath = backupPath;
  }

  if (!hasText(nextInput.skillName)) {
    const skillName = await showInputBox({
      window,
      prompt: "Promoted source skill name",
      placeHolder: "skill-name",
      value: basenameFromPath(nextInput.backupPath ?? nextInput.backup?.backupPath),
    });

    if (skillName === undefined) {
      return cancelled(commandId);
    }

    nextInput.skillName = skillName;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectCompareBackupInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.backupPath) && !hasText(nextInput.backup?.backupPath)) {
    const backupPath = await showFolderOpenDialog({
      window,
      openLabel: "Select Backup Snapshot",
    });

    if (backupPath === undefined) {
      return cancelled(commandId);
    }

    nextInput.backupPath = backupPath;
  }

  if (!hasText(nextInput.referencePath)) {
    const referencePath = await showFolderOpenDialog({
      window,
      openLabel: "Select Reference Skill Folder",
    });

    if (referencePath === undefined) {
      return cancelled(commandId);
    }

    nextInput.referencePath = referencePath;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectRestoreBackupInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const nextInput = { ...input };
  let readModelResult = null;

  async function readModel() {
    if (readModelResult === null) {
      readModelResult = await loadApplyReadModel({ commandId, loadReadModel });
    }
    return readModelResult;
  }

  if (!hasBackup(nextInput.backup) && !hasText(nextInput.backupPath)) {
    const modelResult = await readModel();
    if (modelResult?.ok === false) {
      return modelResult;
    }

    const backupChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: backupSnapshotChoices(modelResult.value),
      placeHolder: "Select backup snapshot to restore",
      unavailableMessage: "No backup snapshots are available.",
    });

    if (!backupChoice.ok) {
      return backupChoice;
    }

    nextInput.backup = backupChoice.choice.value.backup;
  }

  if (!hasTarget(nextInput.target)) {
    const modelResult = await readModel();
    if (modelResult?.ok === false) {
      return modelResult;
    }

    const targetChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: operationalTargetChoices({
        readModel: modelResult.value,
        commandId,
      }),
      placeHolder: "Select target to restore backup to",
      unavailableMessage: "No skill targets are available.",
    });

    if (!targetChoice.ok) {
      return targetChoice;
    }

    nextInput.target = targetChoice.choice.value.target;
  }

  if (
    !hasText(nextInput.skillName) &&
    !hasText(nextInput.backup?.skillName)
  ) {
    const skillName = await showInputBox({
      window,
      prompt: "Restored skill name",
      placeHolder: "skill-name",
      value: basenameFromPath(nextInput.backupPath ?? nextInput.backup?.backupPath),
    });

    if (skillName === undefined) {
      return cancelled(commandId);
    }

    nextInput.skillName = skillName;
  }

  if (nextInput.overwriteConfirmed !== true) {
    const overwriteChoice = await showQuickPick({
      window,
      items: [
        {
          label: "Restore and overwrite target if needed",
          value: true,
        },
        { label: "Cancel", value: false },
      ],
      placeHolder: "Restore backup and overwrite target if it exists?",
    });

    if (overwriteChoice === undefined || overwriteChoice.value !== true) {
      return cancelled(commandId);
    }

    nextInput.overwriteConfirmed = true;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectDeleteBackupInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.backupPath) && !hasText(nextInput.backup?.backupPath)) {
    const backupPath = await showFolderOpenDialog({
      window,
      openLabel: "Select Backup Snapshot",
    });

    if (backupPath === undefined) {
      return cancelled(commandId);
    }

    nextInput.backupPath = backupPath;
  }

  if (nextInput.confirmationProvided !== true) {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Delete backup snapshot", value: true },
        { label: "Cancel", value: false },
      ],
      placeHolder: "Delete backup snapshot?",
    });

    if (choice === undefined || choice.value !== true) {
      return cancelled(commandId);
    }

    nextInput.confirmationProvided = true;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectCreateSkillInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.name)) {
    const name = await showInputBox({
      window,
      prompt: "Skill name",
      placeHolder: "my-skill-name",
    });

    if (name === undefined) {
      return cancelled(commandId);
    }

    nextInput.name = name;
  }

  if (!hasText(nextInput.description)) {
    const description = await showInputBox({
      window,
      prompt: "Skill description",
      placeHolder: "Use this skill when...",
    });

    if (description === undefined) {
      return cancelled(commandId);
    }

    nextInput.description = description;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectImportSkillInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.externalSourcePath)) {
    const sourcePath = await showFolderOpenDialog({ window });

    if (sourcePath === undefined) {
      return cancelled(commandId);
    }

    nextInput.externalSourcePath = sourcePath;
  }

  if (!hasText(nextInput.name)) {
    const name = await showInputBox({
      window,
      prompt: "Imported skill name",
      placeHolder: "my-imported-skill",
      value: basenameFromPath(nextInput.externalSourcePath),
    });

    if (name === undefined) {
      return cancelled(commandId);
    }

    nextInput.name = name;
  }

  if (typeof nextInput.runAnalysisAfterImport !== "boolean") {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Run analysis", value: true },
        { label: "Skip analysis", value: false },
      ],
      placeHolder: "Analyze this skill after import?",
    });

    if (choice === undefined) {
      return cancelled(commandId);
    }

    nextInput.runAnalysisAfterImport = choice.value;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectInstallSkillInput({ commandId, input, window }) {
  const nextInput = { ...input };

  if (!hasText(nextInput.sourceReference)) {
    const sourceReference = await showInputBox({
      window,
      prompt: "GitHub URL or local skill folder path",
      placeHolder:
        "https://github.com/owner/skill-repo or /path/to/skill",
    });

    if (sourceReference === undefined) {
      return cancelled(commandId);
    }

    nextInput.sourceReference = sourceReference;
  }

  if (
    !hasText(nextInput.name) &&
    isGitHubSourceReference(nextInput.sourceReference)
  ) {
    nextInput.installAllDiscoveredSkills = true;
  }

  if (
    nextInput.installAllDiscoveredSkills !== true &&
    !hasText(nextInput.name)
  ) {
    const name = await showInputBox({
      window,
      prompt: "Installed skill name",
      placeHolder: "my-installed-skill",
      value: basenameFromReference(nextInput.sourceReference),
    });

    if (name === undefined) {
      return cancelled(commandId);
    }

    nextInput.name = name;
  }

  if (typeof nextInput.runAnalysisAfterInstall !== "boolean") {
    const choice = await showQuickPick({
      window,
      items: [
        { label: "Run analysis", value: true },
        { label: "Skip analysis", value: false },
      ],
      placeHolder: "Analyze this skill after install?",
    });

    if (choice === undefined) {
      return cancelled(commandId);
    }

    nextInput.runAnalysisAfterInstall = choice.value;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectApplySkillInput({
  commandId,
  input,
  window,
  loadReadModel,
  targetScope,
}) {
  const nextInput = { ...input };

  if (
    hasSource(nextInput.source) &&
    hasTarget(nextInput.target) &&
    hasApplyMode(nextInput.applyMode)
  ) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  const readModel =
    hasSource(nextInput.source) && hasTarget(nextInput.target)
      ? null
      : await loadApplyReadModel({ commandId, loadReadModel });

  if (readModel?.ok === false) {
    return readModel;
  }

  if (!hasSource(nextInput.source)) {
    const sourceChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: sourceChoices(readModel.value),
      placeHolder: "Select source skill",
      unavailableMessage: "No source skills are available.",
    });

    if (!sourceChoice.ok) {
      return sourceChoice;
    }

    nextInput.source = sourceChoice.choice.value;
  }

  if (!hasTarget(nextInput.target)) {
    if (targetScope === "global") {
      const triggerTarget = targetChoices({
        readModel: readModel.value,
        targetScope,
        source: nextInput.source,
      })[0];
      if (!triggerTarget) {
        return unavailable(commandId, "No global targets are available.");
      }
      nextInput.target = omitUndefinedTargetFields(triggerTarget.value);
    } else {
    const targetChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: targetChoices({
        readModel: readModel.value,
        targetScope,
        source: nextInput.source,
      }),
      placeHolder:
        targetScope === "project"
          ? "Select project target"
          : "Select global target",
      unavailableMessage:
        targetScope === "project"
          ? "No project targets are available."
          : "No global targets are available.",
    });

    if (!targetChoice.ok) {
      return targetChoice;
    }

    nextInput.target = targetChoice.choice.value;
    }
  }

  if (!hasApplyMode(nextInput.applyMode)) {
    const applyModeChoice = await showQuickPick({
      window,
      items: [
        { label: "copy", value: "copy" },
        { label: "symlink", value: "symlink" },
      ],
      placeHolder: "Select apply mode",
    });

    if (applyModeChoice === undefined) {
      return cancelled(commandId);
    }

    nextInput.applyMode = applyModeChoice.value;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectRemoveAppliedSkillInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  return collectAppliedSkillSelectionInput({
    commandId,
    input,
    window,
    loadReadModel,
  });
}

async function collectTransferAppliedSkillInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const selected = await collectAppliedSkillSelectionInput({
    commandId,
    input,
    window,
    loadReadModel,
  });

  if (!selected.ok) {
    return selected;
  }

  const nextInput = selected.input;

  if (
    (commandId === "sponzeySkills.copyAppliedSkillToMainRepository" ||
      commandId === "sponzeySkills.moveAppliedSkillToMainRepository") &&
    !hasText(nextInput.sourceName)
  ) {
    const sourceName = await showInputBox({
      window,
      prompt: "Source skill name",
      placeHolder: "Source skill name",
      value: nextInput.appliedSkill.name,
    });

    if (sourceName === undefined) {
      return cancelled(commandId);
    }

    nextInput.sourceName = sourceName;
  }

  if (
    commandId === "sponzeySkills.backupAppliedSkillToMainRepository" &&
    !hasText(nextInput.snapshotId)
  ) {
    const snapshotId = await showInputBox({
      window,
      prompt: "Backup snapshot ID",
      placeHolder: "Backup snapshot ID",
    });

    if (snapshotId === undefined) {
      return cancelled(commandId);
    }

    nextInput.snapshotId = snapshotId;
  }

  if (
    commandId === "sponzeySkills.moveAppliedSkillToMainRepository" &&
    typeof nextInput.cleanupConfirmed !== "boolean"
  ) {
    const cleanupChoice = await showQuickPick({
      window,
      items: [
        { label: "Remove target entry after copy", value: true },
        { label: "Keep target entry", value: false },
      ],
      placeHolder: "Remove original target entry after copy?",
    });

    if (cleanupChoice === undefined) {
      return cancelled(commandId);
    }

    nextInput.cleanupConfirmed = cleanupChoice.value;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectAppliedSkillSelectionInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const nextInput = { ...input };

  if (hasTarget(nextInput.target) && hasAppliedSkill(nextInput.appliedSkill)) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  const readModel = await loadApplyReadModel({ commandId, loadReadModel });

  if (readModel?.ok === false) {
    return readModel;
  }

  let selectedGroup = targetGroupForTarget({
    readModel: readModel.value,
    target: nextInput.target,
  });
  const promptText = appliedSkillSelectionPromptText(commandId);

  if (!hasTarget(nextInput.target)) {
    const targetChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: operationalTargetChoices({
        readModel: readModel.value,
        commandId,
      }),
      placeHolder: promptText.targetPlaceHolder,
      unavailableMessage: "No skill targets are available.",
    });

    if (!targetChoice.ok) {
      return targetChoice;
    }

    nextInput.target = targetChoice.choice.value.target;
    selectedGroup = targetChoice.choice.value.group;
  }

  if (!hasAppliedSkill(nextInput.appliedSkill)) {
    const appliedSkillChoice = await chooseRequiredQuickPick({
      commandId,
      window,
      items: appliedSkillChoices(selectedGroup),
      placeHolder: promptText.appliedSkillPlaceHolder,
      unavailableMessage: "No applied skills are available for this target.",
    });

    if (!appliedSkillChoice.ok) {
      return appliedSkillChoice;
    }

    nextInput.appliedSkill = appliedSkillChoice.choice.value;
  }

  return {
    ok: true,
    input: nextInput,
  };
}

function appliedSkillSelectionPromptText(commandId) {
  if (commandId === "sponzeySkills.removeAppliedSkill") {
    return {
      targetPlaceHolder: "Select target to remove skill from",
      appliedSkillPlaceHolder: "Select applied target skill to remove",
    };
  }

  if (commandId === "sponzeySkills.copyAppliedSkillToMainRepository") {
    return {
      targetPlaceHolder: "Select target to copy skill from",
      appliedSkillPlaceHolder: "Select applied target skill to copy",
    };
  }

  if (commandId === "sponzeySkills.backupAppliedSkillToMainRepository") {
    return {
      targetPlaceHolder: "Select target to back up skill from",
      appliedSkillPlaceHolder: "Select applied target skill to back up",
    };
  }

  if (commandId === "sponzeySkills.moveAppliedSkillToMainRepository") {
    return {
      targetPlaceHolder: "Select target to move skill from",
      appliedSkillPlaceHolder: "Select applied target skill to move",
    };
  }

  return {
    targetPlaceHolder: "Select target",
    appliedSkillPlaceHolder: "Select applied skill",
  };
}

async function collectSourceSelectionInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const nextInput = { ...input };

  if (hasSource(nextInput.source)) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  const readModel = await loadApplyReadModel({ commandId, loadReadModel });
  if (readModel?.ok === false) {
    return readModel;
  }

  const sourceChoice = await chooseRequiredQuickPick({
    commandId,
    window,
    items: sourceChoices(readModel.value),
    placeHolder: "Select source skill",
    unavailableMessage: "No source skills are available.",
  });

  if (!sourceChoice.ok) {
    return sourceChoice;
  }

  nextInput.source = sourceChoice.choice.value;

  return {
    ok: true,
    input: nextInput,
  };
}

async function collectAppliedSkillWithSourceInput({
  commandId,
  input,
  window,
  loadReadModel,
}) {
  const selected = await collectAppliedSkillSelectionInput({
    commandId,
    input,
    window,
    loadReadModel,
  });

  if (!selected.ok) {
    return selected;
  }

  const nextInput = selected.input;

  if (hasSource(nextInput.source)) {
    return {
      ok: true,
      input: nextInput,
    };
  }

  const readModel = await loadApplyReadModel({ commandId, loadReadModel });
  if (readModel?.ok === false) {
    return readModel;
  }

  const matchedSource = sourceById({
    readModel: readModel.value,
    sourceId: nextInput.appliedSkill?.sourceId,
    name: nextInput.appliedSkill?.name,
  });

  if (matchedSource) {
    nextInput.source = matchedSource;
    return {
      ok: true,
      input: nextInput,
    };
  }

  const sourceChoice = await chooseRequiredQuickPick({
    commandId,
    window,
    items: sourceChoices(readModel.value),
    placeHolder: "Select source skill",
    unavailableMessage: "No source skills are available.",
  });

  if (!sourceChoice.ok) {
    return sourceChoice;
  }

  nextInput.source = sourceChoice.choice.value;

  return {
    ok: true,
    input: nextInput,
  };
}

async function showInputBox({ window, prompt, placeHolder, value }) {
  return window.showInputBox({
    prompt,
    placeHolder,
    value,
    ignoreFocusOut: true,
  });
}

async function showFolderOpenDialog({
  window,
  openLabel = "Select Skill Folder",
} = {}) {
  const selected = await window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel,
  });

  const first = selected?.[0];
  const fsPath = first?.fsPath;

  if (typeof fsPath === "string" && fsPath.length > 0) {
    return fsPath;
  }

  return undefined;
}

async function showFileOpenDialog({
  window,
  openLabel = "Select File",
} = {}) {
  const selected = await window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel,
  });

  const first = selected?.[0];
  const fsPath = first?.fsPath;

  if (typeof fsPath === "string" && fsPath.length > 0) {
    return fsPath;
  }

  return undefined;
}

async function showQuickPick({ window, items, placeHolder }) {
  return window.showQuickPick(items, {
    placeHolder,
    ignoreFocusOut: true,
  });
}

async function chooseRequiredQuickPick({
  commandId,
  window,
  items,
  placeHolder,
  unavailableMessage,
}) {
  if (!Array.isArray(items) || items.length === 0) {
    return unavailable(commandId, unavailableMessage);
  }

  const choice = await showQuickPick({ window, items, placeHolder });

  if (choice === undefined) {
    return cancelled(commandId);
  }

  return {
    ok: true,
    choice,
  };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isGitHubSourceReference(value) {
  const reference = String(value ?? "").trim();
  if (/^git@github\.com:/i.test(reference)) {
    return true;
  }

  try {
    return new URL(reference).hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

function hasSource(source) {
  return (
    source &&
    typeof source === "object" &&
    hasText(source.name) &&
    hasText(source.sourcePath)
  );
}

function hasTarget(target) {
  return (
    target &&
    typeof target === "object" &&
    hasText(target.id) &&
    hasText(target.targetPath)
  );
}

function hasApplyMode(applyMode) {
  return applyMode === "copy" || applyMode === "symlink";
}

function isTransferCommand(commandId) {
  return (
    commandId === "sponzeySkills.copyAppliedSkillToMainRepository" ||
    commandId === "sponzeySkills.backupAppliedSkillToMainRepository" ||
    commandId === "sponzeySkills.moveAppliedSkillToMainRepository"
  );
}

function hasAppliedSkill(appliedSkill) {
  return (
    appliedSkill &&
    typeof appliedSkill === "object" &&
    hasText(appliedSkill.name) &&
    hasText(appliedSkill.kind) &&
    hasText(appliedSkill.targetPath)
  );
}

function hasBackup(backup) {
  return (
    backup &&
    typeof backup === "object" &&
    hasText(backup.skillName) &&
    hasText(backup.snapshotId) &&
    hasText(backup.backupPath)
  );
}

function hasDiagnostic(diagnostic) {
  return (
    diagnostic &&
    typeof diagnostic === "object" &&
    hasText(diagnostic.code) &&
    hasText(diagnostic.severity)
  );
}

function supportedDiagnosticActionChoices(diagnosticActions) {
  const allowed = actionCodeSet(diagnosticActions?.allowedActionCodes);
  const blocked = actionCodeSet(diagnosticActions?.blockedActionCodes);
  const confirmationRequired = actionCodeSet(
    diagnosticActions?.confirmationRequiredActionCodes,
  );

  return SUPPORTED_DIAGNOSTIC_ACTION_CHOICES.filter((action) => {
    return (
      allowed.has(action.code) &&
      !blocked.has(action.code)
    );
  }).map((action) => ({
    label: action.label,
    description: confirmationRequired.has(action.code)
      ? `${action.description} Confirmation required.`
      : action.description,
    value: action.code,
  }));
}

function diagnosticActionRequiresConfirmation({
  actionCode,
  diagnosticActions,
}) {
  return actionCodeSet(
    diagnosticActions?.confirmationRequiredActionCodes,
  ).has(actionCode);
}

function actionCodeSet(values) {
  return new Set(
    (Array.isArray(values) ? values : []).filter(
      (value) => typeof value === "string" && value.trim().length > 0,
    ),
  );
}

function sourceAppliedTargetCount(source) {
  if (typeof source?.appliedTargetCount === "number") {
    return source.appliedTargetCount;
  }

  if (Array.isArray(source?.appliedTargets)) {
    return source.appliedTargets.length;
  }

  return 0;
}

function basenameFromPath(value) {
  return String(value ?? "")
    .split(/[\\/]/)
    .filter((part) => part.length > 0)
    .at(-1);
}

function basenameFromReference(value) {
  const reference = String(value ?? "").trim();

  try {
    const url = new URL(reference);
    const segments = url.pathname.split("/").filter((part) => part.length > 0);
    const treeIndex = segments.indexOf("tree");

    if (treeIndex >= 0 && segments.length > treeIndex + 2) {
      return stripGitSuffix(segments.at(-1));
    }

    return stripGitSuffix(segments[1] ?? basenameFromPath(reference));
  } catch {
    return stripGitSuffix(basenameFromPath(reference));
  }
}

function stripGitSuffix(value) {
  return String(value ?? "").replace(/\.git$/, "");
}

function archiveNameToSkillName(value) {
  return String(basenameFromPath(value) ?? "")
    .replace(/\.sponzey-skill\.json$/i, "")
    .replace(/\.json$/i, "")
    .replace(/\.zip$/i, "");
}

async function loadApplyReadModel({ commandId, loadReadModel }) {
  if (typeof loadReadModel !== "function") {
    return unavailable(commandId, "Command input choices are unavailable.");
  }

  return {
    ok: true,
    value: await loadReadModel(),
  };
}

function sourceChoices(readModel) {
  return (readModel?.mainRepositorySkills ?? []).map((skill) => ({
    label: skill.name,
    description: skill.status,
    detail: skill.sourcePath,
    value: {
      ...skill,
      id: skill.id ?? skill.name,
      name: skill.name,
      sourcePath: skill.sourcePath,
    },
  }));
}

function targetChoices({ readModel, targetScope, source = null }) {
  const groups = allTargetGroups(readModel).filter((group) => group.scope === targetScope);

  return groups
    .filter((group) => targetAllows(group, "applyable"))
    .map((group) => ({
    label: targetChoiceLabel(group),
    description: targetChoiceDescriptionWithCompatibility({ group, source }),
    value: targetFromGroup(group),
    }));
}

function globalRepositoryChoices(readModel) {
  return allTargetGroups(readModel)
    .filter((group) => group.scope === "global")
    .filter((group) => group.origin !== "standard")
    .map((group) => ({
    label: group.targetId,
    description: group.clientType,
    detail: group.targetPath,
    value: {
      targetId: group.targetId,
    },
  }));
}

function projectRepositoryChoices(readModel) {
  const choicesByPattern = new Map();

  for (const group of allTargetGroups(readModel).filter((entry) => entry.scope === "project")) {
    if (group.origin === "standard") {
      continue;
    }
    const targetPattern = group.targetPattern ?? targetPatternFromGroup(group);

    if (!hasText(targetPattern) || choicesByPattern.has(targetPattern)) {
      continue;
    }

    choicesByPattern.set(targetPattern, {
      label: targetPattern,
      description: group.clientType,
      value: {
        targetPattern,
      },
    });
  }

  return [...choicesByPattern.values()];
}

function operationalTargetChoices({ readModel, commandId }) {
  const capability = capabilityForCommand(commandId);
  return allTargetGroups(readModel)
    .filter((group) => targetAllows(group, capability))
    .map(
    (group) => ({
      label: targetChoiceLabel(group),
      description: targetChoiceDescription(group),
      value: {
        target: targetFromGroup(group),
        group,
      },
    }),
    );
}

function capabilityForCommand(commandId) {
  if (commandId === "sponzeySkills.restoreBackupToTarget") {
    return "applyable";
  }
  if (commandId === "sponzeySkills.moveAppliedSkillToMainRepository") {
    return "movable";
  }
  if (commandId === "sponzeySkills.copyAppliedSkillToMainRepository") {
    return "copyable";
  }
  if (commandId === "sponzeySkills.backupAppliedSkillToMainRepository") {
    return "backupable";
  }
  return "removable";
}

function targetAllows(group, capability) {
  return group?.capabilities?.[capability] !== false;
}

function appliedSkillChoices(group) {
  return (group?.skills ?? []).map((skill) => ({
    label: skill.name,
    description: skill.kind,
    detail: skill.targetPath,
    value: {
      ...skill,
      name: skill.name,
      kind: skill.kind,
      status: skill.status,
      targetPath: skill.targetPath,
      sourceId: skill.sourceId,
    },
  }));
}

function backupSnapshotChoices(readModel) {
  return (readModel?.backups ?? []).map((backup) => ({
    label: `${backup.skillName}:${backup.snapshotId}`,
    description: backup.createdAt ?? "Backup Snapshot",
    detail: backup.backupPath,
    value: {
      backup,
    },
  }));
}

function skillDetailChoices(readModel) {
  const sourceItems = sourceChoices(readModel).map((choice) => ({
    ...choice,
    description: "Main Repository",
    value: {
      source: choice.value,
    },
  }));

  const appliedItems = [
    ...allTargetGroups(readModel),
  ].flatMap((group) =>
    appliedSkillChoices(group).map((choice) => ({
      ...choice,
      label: `${choice.label} (${targetChoiceLabel(group)})`,
      description: choice.value.kind,
      value: {
        target: targetFromGroup(group),
        appliedSkill: choice.value,
      },
    })),
  );

  const backupItems = (readModel?.backups ?? []).map((backup) => ({
    label: `Backup ${backup.skillName}:${backup.snapshotId}`,
    description: "Backup Snapshot",
    detail: backup.backupPath,
    value: {
      backup,
    },
  }));

  const diagnosticItems = (readModel?.diagnostics ?? [])
    .filter(hasDiagnostic)
    .map((diagnostic) => ({
      label: diagnostic.code,
      description: diagnostic.severity,
      detail: diagnostic.message,
      value: {
        diagnostic,
      },
    }));

  return [...sourceItems, ...appliedItems, ...backupItems, ...diagnosticItems];
}

function targetChoiceLabel(group) {
  if (group?.scope === "project") {
    return `${group.clientType ?? "custom"} project`;
  }

  return group?.targetId;
}

function targetChoiceDescription(group) {
  if (group?.scope === "project") {
    return group.targetPattern ?? targetPatternFromGroup(group) ?? "project";
  }

  return group?.targetPath;
}

function targetChoiceDescriptionWithCompatibility({ group, source }) {
  return appendDescriptionSuffix(
    targetChoiceDescription(group),
    compatibilityLabelForTarget({ source, clientType: group?.clientType }),
  );
}

function compatibilityLabelForTarget({ source, clientType }) {
  const normalizedClientType = String(clientType ?? "").trim().toLowerCase();

  if (!hasText(normalizedClientType) || normalizedClientType === "custom") {
    return "compatibility unknown";
  }

  const explicitCompatibility = compatibilityValueForClient({
    compatibility: source?.compatibility,
    clientType: normalizedClientType,
  });
  if (explicitCompatibility) {
    return explicitCompatibility;
  }

  if (
    normalizedClientType !== "codex" &&
    hasDiagnosticCode(source, "codex-only-compatibility")
  ) {
    return "compatibility warning";
  }

  if (
    normalizedClientType !== "claude" &&
    hasDiagnosticCode(source, "claude-only-compatibility")
  ) {
    return "compatibility warning";
  }

  if (
    source?.compatibility &&
    typeof source.compatibility === "object" &&
    Object.keys(source.compatibility).length > 0
  ) {
    return "compatibility unknown";
  }

  return null;
}

function compatibilityValueForClient({ compatibility, clientType }) {
  if (!compatibility || typeof compatibility !== "object") {
    return null;
  }

  if (!Object.hasOwn(compatibility, clientType)) {
    return null;
  }

  const value = compatibility[clientType];
  if (value === true || value === "compatible") {
    return "compatible";
  }

  if (
    value === false ||
    value === "incompatible" ||
    value === "unsupported" ||
    value === "warning"
  ) {
    return "compatibility warning";
  }

  return "compatibility unknown";
}

function hasDiagnosticCode(source, code) {
  return (source?.diagnostics ?? []).some(
    (diagnostic) => diagnostic?.code === code,
  );
}

function appendDescriptionSuffix(description, suffix) {
  if (!hasText(suffix)) {
    return description;
  }

  if (!hasText(description)) {
    return suffix;
  }

  return `${description} · ${suffix}`;
}

function sourceById({ readModel, sourceId, name }) {
  const source = (readModel?.mainRepositorySkills ?? []).find((skill) => {
    const id = skill.id ?? skill.name;
    return (hasText(sourceId) && id === sourceId) || (hasText(name) && skill.name === name);
  });

  if (!source) {
    return null;
  }

  return {
    ...source,
    id: source.id ?? source.name,
    name: source.name,
    sourcePath: source.sourcePath,
  };
}

function targetGroupForTarget({ readModel, target }) {
  if (!hasTarget(target)) {
    return null;
  }

  return allTargetGroups(readModel).find(
    (group) => group.targetId === target.id,
  );
}

function allTargetGroups(readModel) {
  if (Array.isArray(readModel?.targetGroups)) {
    return readModel.targetGroups;
  }
  return [...(readModel?.globalSkills ?? []), ...(readModel?.projectSkills ?? [])];
}

function targetFromGroup(group) {
  const target = {
    id: group.targetId,
    clientType: group.clientType,
    scope: group.scope,
    targetPath: group.targetPath,
    workspacePath: group.workspacePath,
    targetPattern: group.targetPattern,
  };

  if (group.origin !== undefined) {
    target.origin = group.origin;
  }
  if (group.capabilities !== undefined) {
    target.capabilities = group.capabilities;
  }

  return target;
}

function omitUndefinedTargetFields(target) {
  return Object.fromEntries(
    Object.entries(target ?? {}).filter(([, value]) => value !== undefined),
  );
}

function targetPatternFromGroup(group) {
  const targetId = String(group?.targetId ?? "");
  const workspacePath = String(group?.workspacePath ?? "");
  const prefix = `project:${workspacePath}:`;

  if (workspacePath.length > 0 && targetId.startsWith(prefix)) {
    return targetId.slice(prefix.length);
  }

  const marker = ":.";
  const markerIndex = targetId.indexOf(marker);

  if (markerIndex >= 0) {
    return targetId.slice(markerIndex + 1);
  }

  return "";
}

function cancelled(commandId) {
  return {
    ok: false,
    result: {
      ok: false,
      cancelled: true,
      diagnostics: [
        {
          code: "command-input-cancelled",
          severity: "warning",
          message: "Command input was cancelled.",
        },
      ],
      events: [
        {
          level: "ProductLog",
          code: "command.input.cancelled",
          commandId,
        },
      ],
    },
  };
}

function unavailable(commandId, message) {
  return {
    ok: false,
    result: {
      ok: false,
      diagnostics: [
        {
          code: "command-input-unavailable",
          severity: "error",
          message,
        },
      ],
      events: [
        {
          level: "ProductLog",
          code: "command.input.unavailable",
          commandId,
        },
      ],
    },
  };
}
