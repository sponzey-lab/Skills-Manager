import test from "node:test";
import assert from "node:assert/strict";

import { createExtensionComposition } from "../src/extension-composition.js";

test("createExtensionComposition runs Global enrollment migration then reconciliation and explicitly invalidates", async () => {
  const calls = [];
  const composition = await createExtensionComposition({
    settingsReader: { async readSettings() { return validSettings(); } },
    workspaceRoots: [],
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          calls.push("scanSourceSkills");
          return { ok: true, sources: [] };
        },
      },
      targetStore: {
        async scanAppliedSkills() {
          calls.push("scanAppliedSkills");
          return { ok: true, appliedSkills: [], diagnostics: [] };
        },
      },
      globalEnrollmentStore: {
        async readGlobalSkillEnrollments() {
          calls.push("readGlobalSkillEnrollments");
          return { ok: true, enrollments: [] };
        },
        async writeGlobalSkillEnrollments() {
          calls.push("writeGlobalSkillEnrollments");
          return { ok: true };
        },
      },
      enrollmentMutationNotifier: async () => calls.push("invalidateEnrollmentReadModel"),
    },
  });

  assert.equal(composition.ok, true);
  assert.equal(composition.globalEnrollmentLifecycle.migration.ok, true);
  assert.equal(composition.globalEnrollmentLifecycle.reconciliation.ok, true);
  assert.deepEqual(calls, [
    "scanSourceSkills",
    "readGlobalSkillEnrollments",
    "readGlobalSkillEnrollments",
    "scanSourceSkills",
  ]);
});

test("createExtensionComposition requests one explicit refresh when reconciliation writes enrollment metadata", async () => {
  let readCount = 0;
  let invalidationCount = 0;
  const composition = await createExtensionComposition({
    settingsReader: {
      async readSettings() {
        return {
          ...validSettings(),
          globalTargets: [
            { id: "global:codex", clientType: "codex", scope: "global", targetPath: "/global" },
          ],
        };
      },
    },
    workspaceRoots: [],
    analyzer: { async analyzeSourceSkill() { return { riskLevel: "low", diagnostics: [] }; } },
    adapters: {
      skillRepository: {
        async scanSourceSkills() {
          return { ok: true, sources: [{ id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" }] };
        },
      },
      targetStore: {
        async scanAppliedSkills() { return { ok: true, appliedSkills: [], diagnostics: [] }; },
        async copySkillToTarget() { return { ok: true, targetPath: "/global/alpha" }; },
      },
      globalEnrollmentStore: {
        async readGlobalSkillEnrollments() {
          readCount += 1;
          return {
            ok: true,
            enrollments: [{
              sourceSkillId: "source:alpha",
              defaultApplyMode: "copy",
              lifecycle: "active",
              placements: [],
              remainingCleanupPlacements: [],
            }],
          };
        },
        async writeGlobalSkillEnrollments() { return { ok: true }; },
      },
      enrollmentMutationNotifier: async () => { invalidationCount += 1; },
    },
  });

  assert.equal(composition.globalEnrollmentLifecycle.refreshRequested, true);
  assert.equal(readCount, 2);
  assert.equal(invalidationCount, 1);
});

test("createExtensionComposition routes a Global apply command through persistent enrollment across every target", async () => {
  const appliedRoots = [];
  const writes = [];
  const composition = await createExtensionComposition({
    settingsReader: { async readSettings() { return { ...validSettings(), globalTargets: [
      { id: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex" },
      { id: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude" },
    ] }; } },
    workspaceRoots: [],
    analyzer: { async analyzeSourceSkill() { return { riskLevel: "low" }; } },
    adapters: {
      skillRepository: { async scanSourceSkills() { return { ok: true, sources: [] }; } },
      targetStore: {
        async scanAppliedSkills() { return { ok: true, appliedSkills: [], diagnostics: [] }; },
        async copySkillToTarget({ targetRootPath }) { appliedRoots.push(targetRootPath); return { ok: true, targetPath: `${targetRootPath}/alpha` }; },
      },
      globalEnrollmentStore: {
        async readGlobalSkillEnrollments() { return { ok: true, enrollments: [] }; },
        async writeGlobalSkillEnrollments({ enrollments }) { writes.push(enrollments); return { ok: true }; },
      },
    },
  });

  const result = await composition.commandHandlers["sponzeySkills.applySkillToGlobalTarget"]({
    source: { id: "source:alpha", name: "alpha", sourcePath: "/repo/alpha" },
    target: { id: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex" },
    applyMode: "copy",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(appliedRoots, ["/codex", "/claude"]);
  assert.equal(writes.length, 2);
});

test("createExtensionComposition reads settings once and wires refresh command", async () => {
  let settingsReadCount = 0;
  const analysisStoreCalls = [];
  const composition = await createExtensionComposition({
    settingsReader: {
      async readSettings() {
        settingsReadCount += 1;
        return validSettings();
      },
    },
    workspaceRoots: [],
    adapters: {
      skillRepository: {
        async scanSourceSkills({ repositoryPath }) {
          assert.equal(repositoryPath, "/repo");
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
          throw new Error("target scan must not be called without targets");
        },
      },
      analysisStore: {
        async readAnalysisMetadata(input) {
          analysisStoreCalls.push(input);
          return {
            ok: false,
            error: {
              code: "analysis-metadata-not-found",
              severity: "warning",
              message: "Analysis metadata was not found.",
            },
          };
        },
      },
    },
  });

  const result = await composition.commandHandlers["sponzeySkills.refreshSkills"]();

  assert.equal(settingsReadCount, 1);
  assert.equal(composition.ok, true);
  assert.equal(result.ok, true);
  assert.equal(result.readModel.mainRepositorySkills[0].name, "alpha");
  assert.deepEqual(analysisStoreCalls, [
    {
      repositoryPath: "/repo",
      skillId: "alpha",
    },
  ]);
});

test("createExtensionComposition wires import and apply commands with default analyzer", async () => {
  const calls = [];
  const composition = await createExtensionComposition({
    settingsReader: {
      async readSettings() {
        return validSettings();
      },
    },
    workspaceRoots: [],
    adapters: {
      skillRepository: {
        async importSourceSkill({
          repositoryPath,
          externalSourcePath,
          skillName,
        }) {
          calls.push([
            "importSourceSkill",
            { repositoryPath, externalSourcePath, skillName },
          ]);
          return {
            ok: true,
            source: {
              id: skillName,
              name: skillName,
              sourcePath: `${repositoryPath}/skills/${skillName}`,
            },
          };
        },
        async readSourceSkillFiles({ sourcePath }) {
          calls.push(["readSourceSkillFiles", { sourcePath }]);
          return {
            ok: true,
            files: {
              "SKILL.md": [
                "---",
                "name: alpha",
                "description: Use this skill when testing default analyzer wiring.",
                "---",
                "",
                "Read references/details.md before applying.",
              ].join("\n"),
              "references/details.md": "Reference content.",
            },
          };
        },
      },
      targetStore: {
        async copySkillToTarget({
          sourcePath,
          targetRootPath,
          skillName,
          metadata,
        }) {
          calls.push([
            "copySkillToTarget",
            { sourcePath, targetRootPath, skillName, metadata },
          ]);
          return {
            ok: true,
            targetPath: `${targetRootPath}/${skillName}`,
          };
        },
      },
      skillSourceResolver: {
        async resolveInstallSource({ reference }) {
          calls.push(["resolveInstallSource", { reference }]);
          return {
            ok: true,
            sourcePath: "/tmp/remote/installed",
            origin: {
              type: "github",
              url: reference,
              cloneUrl: "https://github.com/acme/installed.git",
            },
            async cleanup() {
              calls.push(["cleanupInstallSource"]);
            },
          };
        },
      },
    },
  });

  const importResult =
    await composition.commandHandlers["sponzeySkills.importSkill"]({
      name: "alpha",
      externalSourcePath: "/external/alpha",
      runAnalysisAfterImport: true,
    });
  const installResult =
    await composition.commandHandlers["sponzeySkills.installSkill"]({
      name: "installed",
      sourceReference: "https://github.com/acme/installed",
      runAnalysisAfterInstall: true,
    });
  const applyResult =
    await composition.commandHandlers["sponzeySkills.applySkillToGlobalTarget"]({
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
      target: {
        id: "global:codex",
        scope: "global",
        clientType: "codex",
        targetPath: "/target",
      },
    });

  assert.equal(composition.ok, true);
  assert.equal(importResult.ok, true);
  assert.equal(importResult.analysis.riskLevel, "low");
  assert.equal(installResult.ok, true);
  assert.equal(installResult.analysis.riskLevel, "low");
  assert.equal(applyResult.ok, true);
  assert.deepEqual(applyResult.applied, {
    skillName: "alpha",
    targetId: "global:codex",
    applyMode: "copy",
    targetPath: "/target/alpha",
  });
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      "importSourceSkill",
      "readSourceSkillFiles",
      "resolveInstallSource",
      "importSourceSkill",
      "cleanupInstallSource",
      "readSourceSkillFiles",
      "readSourceSkillFiles",
      "copySkillToTarget",
    ],
  );
});

test("createExtensionComposition wires repository management commands", async () => {
  const calls = [];
  const composition = await createExtensionComposition({
    settingsReader: {
      async readSettings() {
        return {
          ...validSettings(),
          globalTargets: [
            {
              id: "global:codex",
              clientType: "codex",
              scope: "global",
              targetPath: "/global",
            },
          ],
        };
      },
    },
    workspaceRoots: [],
    adapters: {
      settingsWriter: {
        async updateMainRepositoryPath(input) {
          calls.push(["updateMainRepositoryPath", input]);
          return {
            ok: true,
            mainRepositoryPath: input.mainRepositoryPath,
          };
        },
      },
      repositoryOpener: {
        async openPath(input) {
          calls.push(["openPath", input]);
          return { ok: true };
        },
      },
      skillRepository: {
        async scanSourceSkills(input) {
          calls.push(["scanSourceSkills", input]);
          return {
            ok: true,
            sources: [],
          };
        },
      },
      targetStore: {
        async scanAppliedSkills(input) {
          calls.push(["scanAppliedSkills", input]);
          return {
            ok: true,
            appliedSkills: [],
            diagnostics: [],
          };
        },
      },
    },
  });

  const setResult =
    await composition.commandHandlers["sponzeySkills.setMainRepository"]({
      mainRepositoryPath: "/new-repo",
    });
  const openResult =
    await composition.commandHandlers["sponzeySkills.openMainRepository"]();
  const diagnosticsResult =
    await composition.commandHandlers["sponzeySkills.showDiagnostics"]();

  assert.equal(composition.ok, true);
  assert.equal(setResult.ok, true);
  assert.equal(openResult.ok, true);
  assert.equal(diagnosticsResult.ok, true);
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      "updateMainRepositoryPath",
      "openPath",
      "scanSourceSkills",
      "scanAppliedSkills",
    ],
  );
  assert.deepEqual(calls[0], [
    "updateMainRepositoryPath",
    { mainRepositoryPath: "/new-repo" },
  ]);
  assert.deepEqual(calls[1], ["openPath", { path: "/repo" }]);
});

test("createExtensionComposition returns diagnostics and keeps settings handlers for invalid context", async () => {
  const calls = [];
  const composition = await createExtensionComposition({
    settingsReader: {
      async readSettings() {
        return {
          ...validSettings(),
          defaultApplyMode: "invalid",
        };
      },
    },
    workspaceRoots: [],
    adapters: {
      settingsWriter: {
        async updateMainRepositoryPath(input) {
          calls.push(["updateMainRepositoryPath", input]);
          return {
            ok: true,
            mainRepositoryPath: input.mainRepositoryPath,
          };
        },
      },
    },
  });

  const result = await composition.commandHandlers["sponzeySkills.refreshSkills"]();
  const setResult =
    await composition.commandHandlers["sponzeySkills.setMainRepository"]({
      mainRepositoryPath: "/fixed-repo",
    });

  assert.equal(composition.ok, false);
  assert.equal(composition.diagnostics[0].code, "invalid-default-apply-mode");
  assert.deepEqual(result, {
    ok: false,
    code: "command-handler-not-wired",
    commandId: "sponzeySkills.refreshSkills",
  });
  assert.equal(setResult.ok, true);
  assert.deepEqual(calls, [
    ["updateMainRepositoryPath", { mainRepositoryPath: "/fixed-repo" }],
  ]);
});

function validSettings() {
  return {
    mainRepositoryPath: "/repo",
    enabledClients: ["codex"],
    globalTargets: [],
    projectTargetPatterns: [],
    defaultApplyMode: "copy",
    riskPolicy: {},
    backupPolicy: {},
    loggingPolicy: {},
  };
}
