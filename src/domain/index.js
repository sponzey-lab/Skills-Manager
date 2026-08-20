export {
  createAppliedSkillPlacement,
  createGlobalSkillEnrollment,
  GLOBAL_SKILL_ENROLLMENT_SCHEMA_VERSION,
  createSkillName,
  createSkillSource,
  createSkillTarget,
  normalizePath,
} from "./model/core.js";
export {
  decideApplyConflictPolicy,
  decideAnalysisRisk,
  decidePotentialAcknowledgement,
  calculateSyncStatus,
  decideRemovePolicy,
  decideRiskPolicy,
  decideTransferPolicy,
  createBuiltInAnalyzerPolicyPack,
  suggestRemediationActions,
  buildRepositoryIndex,
  evaluateSkillNameConflictPolicy,
  evaluateSkillShadowingPolicy,
  evaluateRepositoryPathPolicy,
  ANALYZER_POLICY_VERSION,
  REPOSITORY_INDEX_SCHEMA_VERSION,
  repositoryIndexUnsupportedVersionDiagnostic,
} from "./policy/core-policies.js";

export const layerName = "domain";

export function describeDomainLayer() {
  return {
    layerName,
    ownsExternalIo: false,
  };
}
