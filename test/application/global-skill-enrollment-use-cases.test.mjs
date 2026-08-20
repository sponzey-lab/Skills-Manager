import test from "node:test";
import assert from "node:assert/strict";

import {
  enrollSkillGlobally,
  migrateExistingGlobalEnrollments,
  reconcileGlobalSkillEnrollments,
  removeGlobalSkillEnrollment,
} from "../../src/application/global/global-skill-enrollment-use-cases.js";

test("removeGlobalSkillEnrollment removes only exact managed Global placements and then enrollment", async () => {
  const removedPaths = [];
  const writes = [];
  const result = await removeGlobalSkillEnrollment({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [{ id: "global:codex", scope: "global", targetPath: "/global" }],
    },
    input: { sourceSkillId: "source:alpha" },
    skillRepository: {
      async scanSourceSkills() {
        return { ok: true, sources: [{ id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" }] };
      },
    },
    enrollmentStore: {
      async readGlobalSkillEnrollments() {
        return { ok: true, enrollments: [{ sourceSkillId: "source:alpha", defaultApplyMode: "copy", lifecycle: "active", placements: [{ targetId: "global:codex", applyMode: "copy" }], remainingCleanupPlacements: [] }] };
      },
      async writeGlobalSkillEnrollments(input) { writes.push(input.enrollments); return { ok: true }; },
    },
    targetStore: {
      async scanAppliedSkills() {
        return {
          ok: true,
          appliedSkills: [
            { name: "alpha", kind: "managed-copy", targetPath: "/global/alpha", metadata: { sourceSkillId: "source:alpha", sourcePath: "/repo/alpha" } },
            { name: "alpha", kind: "external", targetPath: "/global/alpha-external" },
          ],
          diagnostics: [],
        };
      },
      async removeTargetEntry({ targetPath }) { removedPaths.push(targetPath); return { ok: true, removedPath: targetPath }; },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(removedPaths, ["/global/alpha"]);
  assert.deepEqual(writes, [[]]);
  assert.equal(result.removal.removedTargetCount, 1);
});

test("removeGlobalSkillEnrollment preserves a deletion-pending retry intent after target removal failure", async () => {
  const writes = [];
  const result = await removeGlobalSkillEnrollment({
    context: { mainRepositoryPath: "/repo", globalTargets: [{ id: "global:codex", scope: "global", targetPath: "/global" }] },
    input: { sourceSkillId: "source:alpha" },
    skillRepository: { async scanSourceSkills() { return { ok: true, sources: [{ id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" }] }; } },
    enrollmentStore: {
      async readGlobalSkillEnrollments() { return { ok: true, enrollments: [{ sourceSkillId: "source:alpha", defaultApplyMode: "copy", lifecycle: "active", placements: [{ targetId: "global:codex", applyMode: "copy" }], remainingCleanupPlacements: [] }] }; },
      async writeGlobalSkillEnrollments(input) { writes.push(input.enrollments); return { ok: true }; },
    },
    targetStore: {
      async scanAppliedSkills() { return { ok: true, appliedSkills: [{ name: "alpha", kind: "managed-copy", targetPath: "/global/alpha", metadata: { sourceSkillId: "source:alpha" } }], diagnostics: [] }; },
      async removeTargetEntry() { return { ok: false, error: { code: "target-remove-failed" } }; },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.removal.removedEnrollment, false);
  assert.equal(result.removal.remainingTargetCount, 1);
  assert.equal(writes[0][0].lifecycle, "deletion-pending");
  assert.deepEqual(writes[0][0].remainingCleanupPlacements, [{ kind: "AppliedSkillPlacement", targetId: "global:codex", applyMode: "copy" }]);
});

test("enrollSkillGlobally persists explicit intent then applies to every applyable Global target", async () => {
  const writes = [];
  const appliedTargetIds = [];
  const result = await enrollSkillGlobally({
    context: {
      mainRepositoryPath: "/repo",
      defaultApplyMode: "copy",
      globalTargets: [
        { id: "global:codex", scope: "global", targetPath: "/codex", capabilities: { applyable: true } },
        { id: "global:claude", scope: "global", targetPath: "/claude", capabilities: { applyable: true } },
        { id: "compatibility:legacy", scope: "global", targetPath: "/legacy", capabilities: { applyable: false } },
      ],
    },
    input: { source: { id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" } },
    enrollmentStore: {
      async readGlobalSkillEnrollments() {
        return { ok: true, enrollments: [] };
      },
      async writeGlobalSkillEnrollments(input) {
        writes.push(input.enrollments);
        return { ok: true };
      },
    },
    skillRepository: {
      async scanSourceSkills() {
        return { ok: true, sources: [{ id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" }] };
      },
    },
    applySkill: async ({ input }) => {
      appliedTargetIds.push(input.target.id);
      return { ok: true, applied: { applyMode: input.applyMode } };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(appliedTargetIds, ["global:codex", "global:claude"]);
  assert.equal(writes.length, 2);
  assert.deepEqual(result.reconciliation, {
    appliedTargetCount: 2,
    skippedTargetCount: 0,
    failedTargetCount: 0,
    wroteEnrollments: true,
  });
});

test("reconcileGlobalSkillEnrollments keeps successful placements when one target fails", async () => {
  const writes = [];
  const result = await reconcileGlobalSkillEnrollments({
    context: {
      mainRepositoryPath: "/repo",
      defaultApplyMode: "copy",
      globalTargets: [
        { id: "global:codex", scope: "global", targetPath: "/codex", capabilities: { applyable: true } },
        { id: "global:claude", scope: "global", targetPath: "/claude", capabilities: { applyable: true } },
        { id: "global:custom", scope: "global", targetPath: "/custom", capabilities: { applyable: true } },
      ],
    },
    skillRepository: {
      async scanSourceSkills() {
        return { ok: true, sources: [{ id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" }] };
      },
    },
    enrollmentStore: {
      async readGlobalSkillEnrollments() {
        return {
          ok: true,
          enrollments: [{
            sourceSkillId: "source:alpha",
            defaultApplyMode: "copy",
            lifecycle: "active",
            placements: [{ targetId: "global:codex", applyMode: "copy" }],
            remainingCleanupPlacements: [],
          }],
        };
      },
      async writeGlobalSkillEnrollments(input) {
        writes.push(input.enrollments);
        return { ok: true };
      },
    },
    applySkill: async ({ input }) =>
      input.target.id === "global:custom"
        ? { ok: false, diagnostics: [{ code: "target-overwrite-rejected" }] }
        : { ok: true, applied: { applyMode: input.applyMode } },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.reconciliation, {
    appliedTargetCount: 1,
    skippedTargetCount: 1,
    failedTargetCount: 1,
    wroteEnrollments: true,
  });
  assert.equal(result.diagnostics[0].code, "target-overwrite-rejected");
  assert.deepEqual(
    writes[0][0].placements.map((placement) => placement.targetId),
    ["global:claude", "global:codex"],
  );
});

test("migrateExistingGlobalEnrollments merges managed Global placements without target writes", async () => {
  const targetCalls = [];
  const enrollmentWrites = [];
  const targetStore = {
    async scanAppliedSkills(input) {
      targetCalls.push(input);
      if (input.targetPath === "/global/claude") {
        return {
          ok: true,
          appliedSkills: [
            {
              name: "alpha",
              kind: "managed-symlink",
              targetPath: "/global/claude/alpha",
              sourcePath: "/repo/alpha",
            },
          ],
          diagnostics: [],
        };
      }
      return {
        ok: true,
        appliedSkills: [
          {
            name: "alpha",
            kind: "managed-symlink",
            targetPath: "/global/codex/alpha",
            sourcePath: "/repo/alpha",
          },
          {
            name: "alpha-copy",
            kind: "managed-copy",
            targetPath: "/global/codex/alpha-copy",
            metadata: {
              sourcePath: "/repo/alpha",
              applyMode: "copy",
            },
          },
          { name: "external", kind: "external", targetPath: "/global/codex/external" },
          { name: "broken", kind: "broken-symlink", targetPath: "/global/codex/broken" },
          {
            name: "unknown-managed",
            kind: "managed-copy",
            targetPath: "/global/codex/unknown-managed",
            metadata: { sourcePath: "/repo/missing", applyMode: "copy" },
          },
        ],
        diagnostics: [],
      };
    },
    async copySkillToTarget() {
      throw new Error("migration must not write target entries");
    },
  };
  const input = {
    context: {
      mainRepositoryPath: "/repo",
      defaultApplyMode: "symlink",
      globalTargets: [
        {
          id: "global:codex",
          clientType: "codex",
          scope: "global",
          targetPath: "/global/codex",
          capabilities: { applyable: true },
        },
        {
          id: "global:claude",
          clientType: "claude",
          scope: "global",
          targetPath: "/global/claude",
          capabilities: { applyable: true },
        },
      ],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [{ id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" }],
        };
      },
    },
    targetStore,
    enrollmentStore: {
      async readGlobalSkillEnrollments() {
        return { ok: true, enrollments: [] };
      },
      async writeGlobalSkillEnrollments(writeInput) {
        enrollmentWrites.push(writeInput);
        return { ok: true };
      },
    },
  };

  const result = await migrateExistingGlobalEnrollments(input);

  assert.equal(result.ok, true);
  assert.deepEqual(targetCalls, [
    { targetPath: "/global/codex", knownSourcePaths: ["/repo/alpha"] },
    { targetPath: "/global/claude", knownSourcePaths: ["/repo/alpha"] },
  ]);
  assert.deepEqual(enrollmentWrites, [
    {
      repositoryPath: "/repo",
      enrollments: [
        {
          kind: "GlobalSkillEnrollment",
          sourceSkillId: "source:alpha",
          defaultApplyMode: "symlink",
          lifecycle: "active",
          placements: [
            { kind: "AppliedSkillPlacement", targetId: "global:claude", applyMode: "symlink" },
            { kind: "AppliedSkillPlacement", targetId: "global:codex", applyMode: "copy" },
            { kind: "AppliedSkillPlacement", targetId: "global:codex", applyMode: "symlink" },
          ],
          remainingCleanupPlacements: [],
        },
      ],
    },
  ]);
  assert.deepEqual(result.migration, {
    createdEnrollmentCount: 1,
    updatedEnrollmentCount: 0,
    excludedPlacementCount: 3,
    wroteEnrollments: true,
  });
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    [
      "global-enrollment-migration-external-excluded",
      "global-enrollment-migration-broken-excluded",
      "global-enrollment-migration-source-not-found",
    ],
  );
});

test("migrateExistingGlobalEnrollments is a no-op when canonical enrollment already covers a placement", async () => {
  let writeCount = 0;
  const result = await migrateExistingGlobalEnrollments({
    context: {
      mainRepositoryPath: "/repo",
      defaultApplyMode: "copy",
      globalTargets: [
        { id: "global:codex", scope: "global", targetPath: "/global", capabilities: { applyable: true } },
      ],
    },
    skillRepository: {
      async scanSourceSkills() {
        return { ok: true, sources: [{ id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" }] };
      },
    },
    targetStore: {
      async scanAppliedSkills() {
        return {
          ok: true,
          appliedSkills: [{ name: "alpha", kind: "managed-symlink", sourcePath: "/repo/alpha" }],
          diagnostics: [],
        };
      },
    },
    enrollmentStore: {
      async readGlobalSkillEnrollments() {
        return {
          ok: true,
          enrollments: [
            {
              sourceSkillId: "source:alpha",
              defaultApplyMode: "symlink",
              lifecycle: "active",
              placements: [{ targetId: "global:codex", applyMode: "symlink" }],
              remainingCleanupPlacements: [],
            },
          ],
        };
      },
      async writeGlobalSkillEnrollments() {
        writeCount += 1;
        return { ok: true };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(writeCount, 0);
  assert.deepEqual(result.migration, {
    createdEnrollmentCount: 0,
    updatedEnrollmentCount: 0,
    excludedPlacementCount: 0,
    wroteEnrollments: false,
  });
});
