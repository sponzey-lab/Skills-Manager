import { layerName as domainLayerName } from "../domain/index.js";
export {
  applySkillToTarget,
  removeAppliedSkill,
} from "./apply/apply-use-cases.js";
export { analyzeSkillDirectory } from "./analysis/analyze-skill-directory.js";
export { createRepositorySkillAnalyzer } from "./analysis/repository-skill-analyzer.js";
export { buildRuntimeContext, createRuntimeContext } from "./config/runtime-context-builder.js";
export { evaluateDiagnosticRemediationActionTransition } from "./diagnostics/remediation-action-state-machine.js";
export {
  enrollSkillGlobally,
  migrateExistingGlobalEnrollments,
  reconcileGlobalSkillEnrollments,
  removeGlobalSkillEnrollment,
} from "./global/global-skill-enrollment-use-cases.js";
export { routeLogEvents } from "./logging/log-event-router.js";
export { createRefreshInvalidationController } from "./watch/refresh-invalidation-controller.js";
export { refreshSkills } from "./refresh/refresh-skills.js";
export { transitionTargetScan } from "./refresh/target-scan-state-machine.js";
export {
  addGlobalRepository,
  addProjectRepository,
  createRepositorySnapshot,
  openMainRepository,
  removeGlobalRepository,
  setMainRepository,
  removeMainRepository,
  removeProjectRepository,
  showDiagnostics,
} from "./repository/repository-management-use-cases.js";
export {
  createSkill,
  importSkillToMainRepository,
  installSkillToMainRepository,
} from "./source/source-skill-use-cases.js";
export {
  analyzeAllSkills,
  compareSkillBackup,
  convertAppliedSkillMode,
  deleteBackup,
  deleteSourceSkill,
  exportSourceSkill,
  getSkillDetail,
  importSkillArchiveToMainRepository,
  listSkillBackups,
  openSkillPath,
  promoteBackupToSkillSource,
  renameSourceSkill,
  restoreBackupToTarget,
  updateAppliedCopyFromSource,
} from "./skill/skill-operation-use-cases.js";
export {
  backupAppliedSkillToMainRepository,
  copyAppliedSkillToMainRepository,
  moveAppliedSkillToMainRepository,
} from "./transfer/transfer-use-cases.js";

export const layerName = "application";

export function describeApplicationLayer() {
  return {
    layerName,
    dependsOn: [domainLayerName],
  };
}
