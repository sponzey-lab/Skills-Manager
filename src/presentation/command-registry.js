export const SPONZEY_COMMANDS = Object.freeze([
  command("sponzeySkills.setMainRepository", "Sponzey Skills: Set Main Repository"),
  command(
    "sponzeySkills.removeMainRepository",
    "Sponzey Skills: Unregister Main Repository (Keep Skills)",
  ),
  command("sponzeySkills.addGlobalRepository", "Sponzey Skills: Add Global Repository"),
  command(
    "sponzeySkills.removeGlobalRepository",
    "Sponzey Skills: Unregister Global Repository (Keep Skills)",
  ),
  command("sponzeySkills.addProjectRepository", "Sponzey Skills: Add Project Repository"),
  command(
    "sponzeySkills.removeProjectRepository",
    "Sponzey Skills: Unregister Project Repository (Keep Skills)",
  ),
  command("sponzeySkills.openMainRepository", "Sponzey Skills: Open Main Repository"),
  command("sponzeySkills.openSourceFolder", "Sponzey Skills: Open Source Folder"),
  command("sponzeySkills.openTargetFolder", "Sponzey Skills: Open Target Folder"),
  command("sponzeySkills.openSkillMd", "Sponzey Skills: Open SKILL.md"),
  command("sponzeySkills.refreshSkills", "Sponzey Skills: Refresh Skills"),
  command("sponzeySkills.createSkill", "Sponzey Skills: Create Skill"),
  command("sponzeySkills.importSkill", "Sponzey Skills: Import Skill to Main Repository"),
  command("sponzeySkills.installSkill", "Sponzey Skills: Install Skill from URL or Path"),
  command("sponzeySkills.showSkillDetail", "Sponzey Skills: Show Skill Detail"),
  command("sponzeySkills.analyzeAllSkills", "Sponzey Skills: Analyze All Skills"),
  command("sponzeySkills.applySkillToGlobalTarget", "Sponzey Skills: Apply Skill to Global Target"),
  command("sponzeySkills.removeGlobalSkillEnrollment", "Sponzey Skills: Remove Global Skill Enrollment"),
  command("sponzeySkills.applySkillToProjectTarget", "Sponzey Skills: Apply Skill to Project Target"),
  command("sponzeySkills.removeAppliedSkill", "Sponzey Skills: Remove Applied Skill"),
  command("sponzeySkills.updateAppliedCopyFromSource", "Sponzey Skills: Update Applied Copy from Source"),
  command("sponzeySkills.convertAppliedSkillMode", "Sponzey Skills: Convert Applied Skill Mode"),
  command("sponzeySkills.copyAppliedSkillToMainRepository", "Sponzey Skills: Copy Applied Skill to Main Repository"),
  command("sponzeySkills.backupAppliedSkillToMainRepository", "Sponzey Skills: Backup Applied Skill to Main Repository"),
  command("sponzeySkills.moveAppliedSkillToMainRepository", "Sponzey Skills: Move Applied Skill to Main Repository"),
  command("sponzeySkills.renameSourceSkill", "Sponzey Skills: Rename Source Skill"),
  command("sponzeySkills.deleteSourceSkill", "Sponzey Skills: Delete Source Skill"),
  command("sponzeySkills.exportSourceSkill", "Sponzey Skills: Export Source Skill"),
  command("sponzeySkills.importSkillArchive", "Sponzey Skills: Import Skill Archive"),
  command("sponzeySkills.listSkillBackups", "Sponzey Skills: List Skill Backups"),
  command("sponzeySkills.compareSkillBackup", "Sponzey Skills: Compare Skill Backup"),
  command("sponzeySkills.restoreBackupToTarget", "Sponzey Skills: Restore Backup to Target"),
  command("sponzeySkills.promoteBackupToSkillSource", "Sponzey Skills: Promote Backup to Skill Source"),
  command("sponzeySkills.deleteBackup", "Sponzey Skills: Delete Backup"),
  command("sponzeySkills.showDiagnostics", "Sponzey Skills: Show Diagnostics"),
  command("sponzeySkills.runDiagnosticAction", "Sponzey Skills: Run Diagnostic Action"),
]);

export function createCommandHandlers(overrides = {}) {
  return Object.fromEntries(
    SPONZEY_COMMANDS.map((descriptor) => [
      descriptor.id,
      overrides[descriptor.id] ?? createNotWiredHandler(descriptor.id),
    ]),
  );
}

export function createUseCaseCommandHandlers({ getContext, useCases }) {
  return Object.fromEntries(
    SPONZEY_COMMANDS.map((descriptor) => [
      descriptor.id,
      createUseCaseCommandHandler({
        commandId: descriptor.id,
        getContext,
        useCases,
      }),
    ]),
  );
}

export function registerSponzeyCommands({ commandsApi, handlers }) {
  return SPONZEY_COMMANDS.map((descriptor) =>
    commandsApi.registerCommand(descriptor.id, handlers[descriptor.id]),
  );
}

const USE_CASE_BY_COMMAND_ID = Object.freeze({
  "sponzeySkills.setMainRepository": "setMainRepository",
  "sponzeySkills.removeMainRepository": "removeMainRepository",
  "sponzeySkills.addGlobalRepository": "addGlobalRepository",
  "sponzeySkills.removeGlobalRepository": "removeGlobalRepository",
  "sponzeySkills.addProjectRepository": "addProjectRepository",
  "sponzeySkills.removeProjectRepository": "removeProjectRepository",
  "sponzeySkills.openMainRepository": "openMainRepository",
  "sponzeySkills.openSourceFolder": "openSkillPath",
  "sponzeySkills.openTargetFolder": "openSkillPath",
  "sponzeySkills.openSkillMd": "openSkillPath",
  "sponzeySkills.refreshSkills": "refreshSkills",
  "sponzeySkills.createSkill": "createSkill",
  "sponzeySkills.importSkill": "importSkillToMainRepository",
  "sponzeySkills.installSkill": "installSkillToMainRepository",
  "sponzeySkills.showSkillDetail": "getSkillDetail",
  "sponzeySkills.analyzeAllSkills": "analyzeAllSkills",
  "sponzeySkills.applySkillToGlobalTarget": "applySkillToTarget",
  "sponzeySkills.removeGlobalSkillEnrollment": "removeGlobalSkillEnrollment",
  "sponzeySkills.applySkillToProjectTarget": "applySkillToTarget",
  "sponzeySkills.removeAppliedSkill": "removeAppliedSkill",
  "sponzeySkills.updateAppliedCopyFromSource": "updateAppliedCopyFromSource",
  "sponzeySkills.convertAppliedSkillMode": "convertAppliedSkillMode",
  "sponzeySkills.copyAppliedSkillToMainRepository":
    "copyAppliedSkillToMainRepository",
  "sponzeySkills.backupAppliedSkillToMainRepository":
    "backupAppliedSkillToMainRepository",
  "sponzeySkills.moveAppliedSkillToMainRepository":
    "moveAppliedSkillToMainRepository",
  "sponzeySkills.renameSourceSkill": "renameSourceSkill",
  "sponzeySkills.deleteSourceSkill": "deleteSourceSkill",
  "sponzeySkills.exportSourceSkill": "exportSourceSkill",
  "sponzeySkills.importSkillArchive": "importSkillArchiveToMainRepository",
  "sponzeySkills.listSkillBackups": "listSkillBackups",
  "sponzeySkills.compareSkillBackup": "compareSkillBackup",
  "sponzeySkills.restoreBackupToTarget": "restoreBackupToTarget",
  "sponzeySkills.promoteBackupToSkillSource": "promoteBackupToSkillSource",
  "sponzeySkills.deleteBackup": "deleteBackup",
  "sponzeySkills.showDiagnostics": "showDiagnostics",
});

function createUseCaseCommandHandler({ commandId, getContext, useCases }) {
  return async (input = {}) => {
    const useCaseName = USE_CASE_BY_COMMAND_ID[commandId];
    const useCase = useCases[useCaseName];

    if (!useCase) {
      return {
        ok: false,
        code: "command-handler-not-wired",
        commandId,
      };
    }

    const context = await getContext();
    return useCase({ context, input });
  };
}

function command(id, title) {
  return Object.freeze({ id, title });
}

function createNotWiredHandler(commandId) {
  return async () => ({
    ok: false,
    code: "command-not-wired",
    commandId,
  });
}
