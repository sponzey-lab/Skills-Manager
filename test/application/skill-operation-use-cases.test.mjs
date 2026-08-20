import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeAllSkills,
  convertAppliedSkillMode,
  compareSkillBackup,
  deleteBackup,
  deleteSourceSkill,
  getSkillDetail,
  openSkillPath,
  restoreBackupToTarget,
  updateAppliedCopyFromSource,
} from "../../src/application/index.js";

test("getSkillDetail returns source detail without reading external systems directly", async () => {
  const result = await getSkillDetail({
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
        description: "Use this skill when testing detail enrichment.",
        riskLevel: "high",
        analysisStatus: "stale",
        lastAnalyzedAt: "2026-07-01T00:00:00.000Z",
        dependencies: ["curl"],
        compatibility: { codex: "compatible" },
        sourceHash: "current-source-hash",
        lastAnalyzedSourceHash: "old-source-hash",
        appliedTargetCount: 2,
      },
    },
    skillRepository: {
      async readSourceSkillFiles({ sourcePath }) {
        assert.equal(sourcePath, "/repo/skills/alpha");
        return {
          ok: true,
          files: {
            "SKILL.md": "body",
            "references/a.md": "reference",
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.detail, {
    type: "source",
    id: "alpha",
    name: "alpha",
    description: "Use this skill when testing detail enrichment.",
    sourcePath: "/repo/skills/alpha",
    skillMdPath: "/repo/skills/alpha/SKILL.md",
    riskLevel: "high",
    analysisStatus: "stale",
    lastAnalyzedAt: "2026-07-01T00:00:00.000Z",
    sourceHash: "current-source-hash",
    lastAnalyzedSourceHash: "old-source-hash",
    diagnostics: [],
    dependencies: ["curl"],
    compatibility: { codex: "compatible" },
    appliedTargetCount: 2,
    files: ["SKILL.md", "references/a.md"],
  });
});

test("getSkillDetail returns enriched applied detail with target context", async () => {
  const result = await getSkillDetail({
    input: {
      target: {
        id: "global:codex",
        clientType: "codex",
        scope: "global",
        targetPath: "/global",
      },
      appliedSkill: {
        name: "alpha",
        kind: "managed-copy",
        status: "managed",
        syncStatus: "Target Changed",
        targetPath: "/global/alpha",
        sourceId: "alpha",
        sourceHash: "source-hash",
        targetHash: "target-hash",
        lastCheckedAt: "2026-07-01T00:00:00.000Z",
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.detail, {
    type: "applied",
    name: "alpha",
    kind: "managed-copy",
    applyMode: "copy",
    status: "managed",
    syncStatus: "Target Changed",
    targetId: "global:codex",
    clientType: "codex",
    scope: "global",
    targetPath: "/global/alpha",
    targetRootPath: "/global",
    sourceId: "alpha",
    sourceHash: "source-hash",
    targetHash: "target-hash",
    lastCheckedAt: "2026-07-01T00:00:00.000Z",
    diagnostics: [],
  });
});

test("getSkillDetail returns diagnostic detail before source detail when diagnostic payload exists", async () => {
  const result = await getSkillDetail({
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
      diagnostic: {
        code: "policy-override-detected",
        severity: "error",
        category: "security",
        message: "Skill attempts to override policy.",
        recommendation: "Do not apply this skill.",
        sourceId: "alpha",
        targetId: "global:codex",
        filePath: "/repo/skills/alpha/SKILL.md",
        line: 12,
      },
    },
    skillRepository: {
      async readSourceSkillFiles() {
        throw new Error("diagnostic detail must not read source files");
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.detail, {
    type: "diagnostic",
    code: "policy-override-detected",
    severity: "error",
    category: "security",
    message: "Skill attempts to override policy.",
    recommendation: "Do not apply this skill.",
    sourceId: "alpha",
    sourceName: "alpha",
    targetId: "global:codex",
    filePath: "/repo/skills/alpha/SKILL.md",
    line: 12,
    relatedCommands: [
      "sponzeySkills.openSkillMd",
      "sponzeySkills.showSkillDetail",
    ],
  });
  assert.deepEqual(result.steps, ["ResolvingItem", "MappingDetail", "Completed"]);
});

test("getSkillDetail returns backup detail with metadata", async () => {
  const result = await getSkillDetail({
    input: {
      backup: {
        skillName: "alpha",
        snapshotId: "snapshot-001",
        backupPath: "/repo/backups/alpha/snapshot-001",
        createdAt: "2026-07-01T00:00:00.000Z",
        sourceHash: "backup-source-hash",
        promotedStatus: "not-promoted",
        metadata: {
          type: "target-backup",
          targetId: "global:codex",
          targetPath: "/global/alpha",
          clientType: "codex",
          scope: "global",
          sourceHash: "backup-source-hash",
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.detail, {
    type: "backup",
    skillName: "alpha",
    snapshotId: "snapshot-001",
    backupPath: "/repo/backups/alpha/snapshot-001",
    createdAt: "2026-07-01T00:00:00.000Z",
    sourceHash: "backup-source-hash",
    promotedStatus: "not-promoted",
    metadata: {
      type: "target-backup",
      targetId: "global:codex",
      targetPath: "/global/alpha",
      clientType: "codex",
      scope: "global",
      sourceHash: "backup-source-hash",
    },
    targetId: "global:codex",
    targetPath: "/global/alpha",
    clientType: "codex",
    scope: "global",
    relatedCommands: [
      "sponzeySkills.promoteBackupToSkillSource",
      "sponzeySkills.deleteBackup",
    ],
  });
  assert.deepEqual(result.steps, ["ResolvingItem", "MappingDetail", "Completed"]);
});

test("openSkillPath opens SKILL.md through opener port", async () => {
  const calls = [];
  const result = await openSkillPath({
    input: {
      openKind: "skillMd",
      source: {
        sourcePath: "/repo/skills/alpha",
      },
    },
    repositoryOpener: {
      async openPath(input) {
        calls.push(input);
        return { ok: true };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    { path: "/repo/skills/alpha/SKILL.md", openMode: "editor" },
  ]);
});

test("analyzeAllSkills summarizes analyzer output for every source", async () => {
  const result = await analyzeAllSkills({
    context: {
      mainRepositoryPath: "/repo",
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [
            { id: "alpha", name: "alpha", sourcePath: "/repo/skills/alpha" },
            { id: "beta", name: "beta", sourcePath: "/repo/skills/beta" },
          ],
        };
      },
    },
    analyzer: {
      async analyzeSourceSkill({ source }) {
        return {
          riskLevel: source.id === "alpha" ? "low" : "high",
          diagnostics:
            source.id === "alpha"
              ? []
              : [{ code: "missing-description", severity: "high" }],
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.summaries.map((summary) => [summary.sourceId, summary.riskLevel]),
    [
      ["alpha", "low"],
      ["beta", "high"],
    ],
  );
  assert.equal(result.diagnostics[0].sourceId, "beta");
});

test("analyzeAllSkills writes repository analysis metadata for every source", async () => {
  const writes = [];
  const hashes = [];
  const result = await analyzeAllSkills({
    context: {
      mainRepositoryPath: "/repo",
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [
            { id: "alpha", name: "alpha", sourcePath: "/repo/skills/alpha" },
          ],
        };
      },
    },
    hashPort: {
      async hashDirectory(input) {
        hashes.push(input);
        return { ok: true, hash: "source-hash-alpha" };
      },
    },
    analysisStore: {
      async writeAnalysisMetadata(input) {
        writes.push(input);
        return { ok: true };
      },
    },
    analyzer: {
      version: "test-analyzer",
      async analyzeSourceSkill() {
        return {
          riskLevel: "medium",
          diagnostics: [
            {
              code: "external-dependencies-detected",
              policyRuleCode: "external-dependencies-detected",
              policyVersion: "builtin-policy-v1",
              severity: "warning",
              category: "dependency",
              recommendation: "Review external dependencies.",
              allowedActions: [
                {
                  code: "open-skill-md",
                  sideEffect: "open-file",
                  mutatesTarget: false,
                  requiresConfirmation: false,
                  safety: "safe",
                },
                {
                  code: "analyze-again",
                  sideEffect: "analysis-refresh",
                  mutatesTarget: false,
                  requiresConfirmation: false,
                  safety: "safe",
                },
              ],
              blockedActions: [],
            },
          ],
          dependencies: ["curl"],
          compatibility: { codex: true, claude: "unknown" },
          policyVersion: "builtin-policy-v1",
        };
      },
    },
    clock: () => "2026-07-01T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(hashes, [{ directoryPath: "/repo/skills/alpha" }]);
  assert.deepEqual(writes, [
    {
      repositoryPath: "/repo",
      metadata: {
        schemaVersion: 1,
        analyzerVersion: "test-analyzer",
        skillId: "alpha",
        skillName: "alpha",
        sourceHash: "source-hash-alpha",
        analyzedAt: "2026-07-01T00:00:00.000Z",
        riskLevel: "medium",
        diagnostics: [
          {
            code: "external-dependencies-detected",
            policyRuleCode: "external-dependencies-detected",
            policyVersion: "builtin-policy-v1",
            severity: "warning",
            category: "dependency",
            recommendation: "Review external dependencies.",
            allowedActions: [
              {
                code: "open-skill-md",
                sideEffect: "open-file",
                mutatesTarget: false,
                requiresConfirmation: false,
                safety: "safe",
              },
              {
                code: "analyze-again",
                sideEffect: "analysis-refresh",
                mutatesTarget: false,
                requiresConfirmation: false,
                safety: "safe",
              },
            ],
            blockedActions: [],
            sourceId: "alpha",
          },
        ],
        policyVersion: "builtin-policy-v1",
        policyRuleCodes: ["external-dependencies-detected"],
        dependencies: ["curl"],
        compatibility: { codex: true, claude: "unknown" },
      },
    },
  ]);
  assert.equal(result.summaries[0].sourceHash, "source-hash-alpha");
  assert.deepEqual(result.steps, [
    "LoadingSources",
    "ReadingSkillFiles",
    "HashingSources",
    "RunningRules",
    "AggregatingDiagnostics",
    "WritingAnalysisMetadata",
    "Completed",
  ]);
});

test("analyzeAllSkills reports metadata write failure without failing analysis", async () => {
  const result = await analyzeAllSkills({
    context: {
      mainRepositoryPath: "/repo",
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [
            { id: "alpha", name: "alpha", sourcePath: "/repo/skills/alpha" },
          ],
        };
      },
    },
    analysisStore: {
      async writeAnalysisMetadata() {
        return {
          ok: false,
          error: {
            code: "analysis-metadata-write-failed",
            severity: "error",
            message: "Analysis metadata could not be written.",
          },
        };
      },
    },
    analyzer: {
      async analyzeSourceSkill() {
        return {
          riskLevel: "low",
          diagnostics: [],
        };
      },
    },
    clock: () => "2026-07-01T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics[0].code, "analysis-metadata-write-failed");
  assert.equal(result.diagnostics[0].sourceId, "alpha");
  assert.deepEqual(
    result.events.map((event) => event.code),
    ["analysis.metadata.write.failed", "skill.analysis.completed"],
  );
});

test("updateAppliedCopyFromSource blocks target changes without confirmation", async () => {
  const result = await updateAppliedCopyFromSource({
    input: {
      source: { id: "alpha", sourcePath: "/repo/skills/alpha" },
      appliedSkill: {
        name: "alpha",
        kind: "managed-copy",
        syncStatus: "Target Changed",
        targetPath: "/target/alpha",
      },
    },
    targetStore: {},
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics[0], {
    code: "local-modification-blocked",
    severity: "error",
    category: "confirmation",
    operation: "update-copy-from-source",
    confirmationKey: "confirmationProvided",
    required: true,
    message: "Target local modifications require explicit confirmation.",
  });
});

test("deleteSourceSkill blocks applied source without impact confirmation", async () => {
  let deleteCalled = false;
  const result = await deleteSourceSkill({
    context: {
      mainRepositoryPath: "/repo",
    },
    input: {
      source: {
        name: "alpha",
        appliedTargetCount: 1,
      },
      skillName: "alpha",
      confirmationProvided: true,
    },
    skillRepository: {
      async deleteSourceSkill() {
        deleteCalled = true;
        return { ok: true };
      },
    },
  });

  assert.equal(deleteCalled, false);
  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics[0].code,
    "source-delete-impact-confirmation-required",
  );
  assert.equal(result.diagnostics[0].category, "confirmation");
  assert.equal(result.diagnostics[0].operation, "source-delete");
  assert.equal(result.diagnostics[0].confirmationKey, "impactConfirmed");
  assert.equal(result.diagnostics[0].required, true);
});

test("deleteSourceSkill blocks source delete without delete confirmation", async () => {
  let deleteCalled = false;
  const result = await deleteSourceSkill({
    context: {
      mainRepositoryPath: "/repo",
    },
    input: {
      source: {
        name: "alpha",
        appliedTargetCount: 0,
      },
      skillName: "alpha",
      impactConfirmed: true,
    },
    skillRepository: {
      async deleteSourceSkill() {
        deleteCalled = true;
        return { ok: true };
      },
    },
  });

  assert.equal(deleteCalled, false);
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics[0], {
    code: "source-delete-confirmation-required",
    severity: "error",
    category: "confirmation",
    operation: "source-delete",
    confirmationKey: "confirmationProvided",
    required: true,
    message: "Source delete requires explicit confirmation.",
  });
});

test("deleteSourceSkill ignores a stale UI count and cleans only exact managed placements before deleting the source", async () => {
  const removedPaths = [];
  const remainingPaths = new Set(["/codex/alpha", "/codex/alpha-external", "/workspace/alpha"]);
  let deleted = false;
  const result = await deleteSourceSkill({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [{ id: "global:codex", scope: "global", targetPath: "/codex" }],
      projectTargets: [{ id: "project:workspace", scope: "project", targetPath: "/workspace" }],
    },
    input: {
      source: {
        id: "source:alpha",
        name: "alpha",
        sourcePath: "/repo/alpha",
        appliedTargetCount: 0,
      },
      confirmationProvided: true,
      cleanupManagedPlacements: true,
    },
    skillRepository: {
      async deleteSourceSkill() {
        deleted = true;
        return { ok: true };
      },
    },
    targetStore: {
      async scanAppliedSkills({ targetPath }) {
        return {
          ok: true,
          appliedSkills: targetPath === "/codex"
            ? [
                remainingPaths.has("/codex/alpha") && { kind: "managed-copy", targetPath: "/codex/alpha", metadata: { sourceSkillId: "source:alpha", sourcePath: "/repo/alpha" } },
                remainingPaths.has("/codex/alpha-external") && { kind: "external", targetPath: "/codex/alpha-external", name: "alpha" },
              ].filter(Boolean)
            : [remainingPaths.has("/workspace/alpha") && { kind: "managed-symlink", targetPath: "/workspace/alpha", sourcePath: "/repo/alpha" }].filter(Boolean),
          diagnostics: [],
        };
      },
      async removeTargetEntry({ targetPath }) {
        removedPaths.push(targetPath);
        remainingPaths.delete(targetPath);
        return { ok: true };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(deleted, true);
  assert.deepEqual(removedPaths, ["/codex/alpha", "/workspace/alpha"]);
  assert.equal(result.sourceDeletion.removedManagedPlacementCount, 2);
});

test("deleteSourceSkill preserves a deletion-pending Global enrollment when managed cleanup fails", async () => {
  const enrollmentWrites = [];
  let deleted = false;
  const result = await deleteSourceSkill({
    context: {
      mainRepositoryPath: "/repo",
      defaultApplyMode: "copy",
      globalTargets: [{ id: "global:codex", scope: "global", targetPath: "/codex" }],
    },
    input: {
      source: { id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha", appliedTargetCount: 0 },
      confirmationProvided: true,
      cleanupManagedPlacements: true,
    },
    skillRepository: {
      async deleteSourceSkill() { deleted = true; return { ok: true }; },
    },
    enrollmentStore: {
      async readGlobalSkillEnrollments() { return { ok: true, enrollments: [] }; },
      async writeGlobalSkillEnrollments({ enrollments }) { enrollmentWrites.push(enrollments); return { ok: true }; },
    },
    targetStore: {
      async scanAppliedSkills() {
        return { ok: true, appliedSkills: [{ kind: "managed-copy", targetPath: "/codex/alpha", metadata: { sourceSkillId: "source:alpha", sourcePath: "/repo/alpha", applyMode: "copy" } }], diagnostics: [] };
      },
      async removeTargetEntry() { return { ok: false, error: { code: "permission-denied" } }; },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(deleted, false);
  assert.equal(result.sourceDeletion.deleted, false);
  assert.equal(enrollmentWrites[0][0].lifecycle, "deletion-pending");
  assert.deepEqual(enrollmentWrites[0][0].remainingCleanupPlacements, [{ kind: "AppliedSkillPlacement", targetId: "global:codex", applyMode: "copy" }]);
});

test("deleteSourceSkill source-only mode disables future Global reconciliation and warns about surviving placements", async () => {
  const enrollmentWrites = [];
  const result = await deleteSourceSkill({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [{ id: "global:codex", scope: "global", targetPath: "/codex" }],
    },
    input: {
      source: { id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha", appliedTargetCount: 0 },
      confirmationProvided: true,
      cleanupManagedPlacements: false,
    },
    skillRepository: { async deleteSourceSkill() { return { ok: true }; } },
    enrollmentStore: {
      async readGlobalSkillEnrollments() {
        return { ok: true, enrollments: [{ sourceSkillId: "source:alpha", defaultApplyMode: "copy", lifecycle: "active", placements: [{ targetId: "global:codex", applyMode: "copy" }], remainingCleanupPlacements: [] }] };
      },
      async writeGlobalSkillEnrollments({ enrollments }) { enrollmentWrites.push(enrollments); return { ok: true }; },
    },
    targetStore: {
      async scanAppliedSkills() {
        return { ok: true, appliedSkills: [{ kind: "managed-copy", targetPath: "/codex/alpha", metadata: { sourceSkillId: "source:alpha", sourcePath: "/repo/alpha" } }], diagnostics: [] };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(enrollmentWrites, [[]]);
  assert.equal(result.sourceDeletion.remainingManagedPlacementCount, 1);
  assert.equal(result.diagnostics[0].code, "source-delete-source-only-managed-placement-remains");
});

test("convertAppliedSkillMode blocks target changes without confirmation taxonomy", async () => {
  let conversionCalled = false;
  const result = await convertAppliedSkillMode({
    input: {
      targetMode: "symlink",
      source: {
        id: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
      appliedSkill: {
        name: "alpha",
        kind: "managed-copy",
        syncStatus: "Target Changed",
        targetPath: "/target/alpha",
      },
    },
    targetStore: {
      async convertCopyToSymlink() {
        conversionCalled = true;
        return { ok: true };
      },
    },
  });

  assert.equal(conversionCalled, false);
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics[0], {
    code: "local-modification-blocked",
    severity: "error",
    category: "confirmation",
    operation: "convert-applied-skill-mode",
    confirmationKey: "confirmationProvided",
    required: true,
    message: "Target local modifications require explicit confirmation.",
  });
});

test("deleteBackup blocks backup delete without confirmation taxonomy", async () => {
  let deleteCalled = false;
  const result = await deleteBackup({
    input: {
      backup: {
        skillName: "alpha",
        snapshotId: "snap-1",
        backupPath: "/repo/.sponzey/backups/alpha/snap-1",
      },
    },
    skillRepository: {
      async deleteBackup() {
        deleteCalled = true;
        return { ok: true };
      },
    },
  });

  assert.equal(deleteCalled, false);
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics[0], {
    code: "backup-delete-confirmation-required",
    severity: "error",
    category: "confirmation",
    operation: "backup-delete",
    confirmationKey: "confirmationProvided",
    required: true,
    message: "Backup delete requires explicit confirmation.",
  });
});

test("compareSkillBackup returns backup comparison summary through explicit port", async () => {
  const calls = [];
  const result = await compareSkillBackup({
    input: {
      backup: {
        backupPath: "/repo/backups/alpha/snapshot-001",
      },
      source: {
        sourcePath: "/repo/skills/alpha",
      },
    },
    backupComparisonPort: {
      async compareDirectories(input) {
        calls.push(input);
        return {
          ok: true,
          comparison: {
            status: "different",
            backupOnlyFiles: ["notes.md"],
            referenceOnlyFiles: ["references/new.md"],
            modifiedFiles: ["SKILL.md"],
            unchangedFileCount: 1,
            backupOnlyFileCount: 1,
            referenceOnlyFileCount: 1,
            modifiedFileCount: 1,
            comparedFileCount: 4,
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      backupPath: "/repo/backups/alpha/snapshot-001",
      referencePath: "/repo/skills/alpha",
    },
  ]);
  assert.deepEqual(result.comparison, {
    status: "different",
    backupPath: "/repo/backups/alpha/snapshot-001",
    referencePath: "/repo/skills/alpha",
    backupOnlyFiles: ["notes.md"],
    referenceOnlyFiles: ["references/new.md"],
    modifiedFiles: ["SKILL.md"],
    unchangedFileCount: 1,
    backupOnlyFileCount: 1,
    referenceOnlyFileCount: 1,
    modifiedFileCount: 1,
    comparedFileCount: 4,
  });
  assert.deepEqual(result.events, [
    {
      level: "ProductLog",
      code: "skill.backup.compare.completed",
      status: "different",
      backupOnlyFileCount: 1,
      referenceOnlyFileCount: 1,
      modifiedFileCount: 1,
      unchangedFileCount: 1,
    },
  ]);
  assert.deepEqual(result.steps, [
    "ValidatingInput",
    "CheckingComparisonPort",
    "ComparingBackup",
    "MappingSummary",
    "Completed",
  ]);
});

test("compareSkillBackup supports explicit target reference path", async () => {
  const calls = [];
  const result = await compareSkillBackup({
    input: {
      backupPath: "/repo/backups/alpha/snapshot-001",
      referencePath: "/target/alpha",
    },
    backupComparisonPort: {
      async compareDirectories(input) {
        calls.push(input);
        return {
          ok: true,
          comparison: {
            status: "identical",
            backupOnlyFiles: [],
            referenceOnlyFiles: [],
            modifiedFiles: [],
            unchangedFileCount: 2,
            backupOnlyFileCount: 0,
            referenceOnlyFileCount: 0,
            modifiedFileCount: 0,
            comparedFileCount: 2,
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      backupPath: "/repo/backups/alpha/snapshot-001",
      referencePath: "/target/alpha",
    },
  ]);
  assert.equal(result.comparison.status, "identical");
});

test("compareSkillBackup fails before side effects when input or port is missing", async () => {
  let compareCalled = false;
  const missingReferenceResult = await compareSkillBackup({
    input: {
      backupPath: "/repo/backups/alpha/snapshot-001",
    },
    backupComparisonPort: {
      async compareDirectories() {
        compareCalled = true;
        return { ok: true, comparison: {} };
      },
    },
  });
  const missingPortResult = await compareSkillBackup({
    input: {
      backupPath: "/repo/backups/alpha/snapshot-001",
      referencePath: "/repo/skills/alpha",
    },
  });

  assert.equal(compareCalled, false);
  assert.equal(missingReferenceResult.ok, false);
  assert.equal(
    missingReferenceResult.diagnostics[0].code,
    "backup-compare-reference-path-required",
  );
  assert.deepEqual(missingReferenceResult.steps, [
    "ValidatingInput",
    "ValidationFailed",
  ]);
  assert.equal(missingPortResult.ok, false);
  assert.equal(
    missingPortResult.diagnostics[0].code,
    "backup-comparison-port-unavailable",
  );
  assert.deepEqual(missingPortResult.steps, [
    "ValidatingInput",
    "CheckingComparisonPort",
    "ComparisonPortUnavailable",
  ]);
});

test("compareSkillBackup maps comparison port failure without leaking paths in product log", async () => {
  const result = await compareSkillBackup({
    input: {
      backupPath: "/repo/backups/alpha/snapshot-001",
      referencePath: "/repo/skills/alpha",
    },
    backupComparisonPort: {
      async compareDirectories() {
        return {
          ok: false,
          error: {
            code: "backup-comparison-path-not-found",
            severity: "error",
            message: "Backup comparison path does not exist.",
          },
        };
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "backup-comparison-path-not-found");
  assert.deepEqual(result.events, [
    {
      level: "ProductLog",
      code: "skill.backup.compare.failed",
      reason: "backup-comparison-path-not-found",
    },
  ]);
  assert.equal("backupPath" in result.events[0], false);
  assert.equal("referencePath" in result.events[0], false);
  assert.equal("backupOnlyFiles" in result.events[0], false);
});

test("restoreBackupToTarget writes target then audit record with explicit input", async () => {
  const calls = [];
  const result = await restoreBackupToTarget({
    context: {
      mainRepositoryPath: "/repo",
    },
    input: {
      backup: {
        backupPath: "/repo/backups/alpha/snapshot-001",
        skillName: "alpha",
        snapshotId: "snapshot-001",
      },
      target: {
        id: "global:codex",
        targetPath: "/global",
        clientType: "codex",
      },
      overwriteConfirmed: false,
    },
    targetStore: {
      async restoreBackupToTarget(input) {
        calls.push(["target", input]);
        return {
          ok: true,
          targetPath: "/global/alpha",
          metadataPath: "/global/alpha/.sponzey-applied.json",
        };
      },
    },
    auditStore: {
      async appendRecord(input) {
        calls.push(["audit", input]);
        return { ok: true, auditPath: "/repo/.sponzey/transfer-log.json" };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    [
      "target",
      {
        backupPath: "/repo/backups/alpha/snapshot-001",
        targetRootPath: "/global",
        skillName: "alpha",
        overwrite: false,
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
    ],
    [
      "audit",
      {
        repositoryPath: "/repo",
        record: {
          operation: "backup-restore",
          code: "skill.backup.restore.completed",
          skillName: "alpha",
          targetId: "global:codex",
          clientType: "codex",
          snapshotId: "snapshot-001",
          overwrite: false,
        },
      },
    ],
  ]);
  assert.deepEqual(result.restored, {
    skillName: "alpha",
    targetId: "global:codex",
    targetPath: "/global/alpha",
    snapshotId: "snapshot-001",
    overwrite: false,
  });
  assert.deepEqual(result.events, [
    {
      level: "ProductLog",
      code: "skill.backup.restore.completed",
      skillName: "alpha",
      targetId: "global:codex",
      overwrite: false,
    },
  ]);
  assert.deepEqual(result.steps, [
    "ValidatingInput",
    "CheckingPorts",
    "CheckingConflict",
    "WritingTarget",
    "WritingAudit",
    "Completed",
  ]);
});

test("restoreBackupToTarget blocks existing target conflict without audit record", async () => {
  const calls = [];
  const result = await restoreBackupToTarget({
    context: {
      mainRepositoryPath: "/repo",
    },
    input: {
      backupPath: "/repo/backups/alpha/snapshot-001",
      skillName: "alpha",
      targetRootPath: "/global",
      targetId: "global:codex",
    },
    targetStore: {
      async restoreBackupToTarget(input) {
        calls.push(["target", input]);
        return {
          ok: false,
          error: {
            code: "target-overwrite-rejected",
            severity: "error",
            message: "Target destination already exists.",
          },
        };
      },
    },
    auditStore: {
      async appendRecord(input) {
        calls.push(["audit", input]);
        return { ok: true };
      },
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ["target"],
  );
  assert.equal(result.diagnostics[0].code, "target-overwrite-rejected");
  assert.deepEqual(result.events, [
    {
      level: "ProductLog",
      code: "skill.backup.restore.blocked",
      skillName: "alpha",
      targetId: "global:codex",
      reason: "target-overwrite-rejected",
      overwrite: false,
    },
  ]);
  assert.deepEqual(result.steps, [
    "ValidatingInput",
    "CheckingPorts",
    "CheckingConflict",
    "Blocked",
  ]);
});

test("restoreBackupToTarget fails before target write when audit store is unavailable", async () => {
  let targetCalled = false;
  const result = await restoreBackupToTarget({
    context: {
      mainRepositoryPath: "/repo",
    },
    input: {
      backupPath: "/repo/backups/alpha/snapshot-001",
      skillName: "alpha",
      targetRootPath: "/global",
    },
    targetStore: {
      async restoreBackupToTarget() {
        targetCalled = true;
        return { ok: true };
      },
    },
  });

  assert.equal(targetCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "backup-restore-audit-store-unavailable");
  assert.deepEqual(result.steps, [
    "ValidatingInput",
    "CheckingPorts",
    "AuditStoreUnavailable",
  ]);
});

test("restoreBackupToTarget maps audit failure after target write", async () => {
  const result = await restoreBackupToTarget({
    context: {
      mainRepositoryPath: "/repo",
    },
    input: {
      backupPath: "/repo/backups/alpha/snapshot-001",
      skillName: "alpha",
      targetRootPath: "/global",
      targetId: "global:codex",
      overwriteConfirmed: true,
    },
    targetStore: {
      async restoreBackupToTarget() {
        return {
          ok: true,
          targetPath: "/global/alpha",
        };
      },
    },
    auditStore: {
      async appendRecord() {
        return {
          ok: false,
          error: {
            code: "transfer-audit-write-failed",
            severity: "warning",
            message: "Transfer audit record could not be written.",
          },
        };
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "transfer-audit-write-failed");
  assert.deepEqual(result.events, [
    {
      level: "ProductLog",
      code: "skill.backup.restore.failed",
      skillName: "alpha",
      targetId: "global:codex",
      reason: "transfer-audit-write-failed",
      overwrite: true,
    },
  ]);
});

test("convertAppliedSkillMode delegates target writes to target store", async () => {
  const calls = [];
  const result = await convertAppliedSkillMode({
    input: {
      targetMode: "copy",
      source: { id: "alpha", sourcePath: "/repo/skills/alpha" },
      appliedSkill: {
        name: "alpha",
        kind: "managed-symlink",
        targetPath: "/target/alpha",
      },
    },
    targetStore: {
      async convertSymlinkToCopy(input) {
        calls.push(input);
        return { ok: true, targetPath: input.targetPath };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      sourcePath: "/repo/skills/alpha",
      targetPath: "/target/alpha",
      metadata: {
        sourceSkillId: "alpha",
        sourcePath: "/repo/skills/alpha",
        applyMode: "copy",
      },
    },
  ]);
});
