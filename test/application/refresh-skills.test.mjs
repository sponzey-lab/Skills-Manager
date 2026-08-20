import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateTargetSkillGroups,
  buildTargetSkillGroup,
  refreshSkills,
} from "../../src/application/refresh/refresh-skills.js";

test("buildTargetSkillGroup preserves target placement metadata without I/O", () => {
  const group = buildTargetSkillGroup({
    target: {
      id: "global:codex",
      clientType: "codex",
      scope: "global",
      targetPath: "/global//skills/",
      origin: "standard",
      capabilities: { applyable: true },
      workspacePath: "/workspace/",
      targetPattern: ".agents/skills",
    },
    skills: [{ name: "alpha", kind: "managed-symlink" }],
  });

  assert.deepEqual(group, {
    targetId: "global:codex",
    clientType: "codex",
    scope: "global",
    targetPath: "/global/skills",
    skills: [{ name: "alpha", kind: "managed-symlink" }],
    origin: "standard",
    capabilities: { applyable: true },
    workspacePath: "/workspace",
    targetPattern: ".agents/skills",
  });
});

test("aggregateTargetSkillGroups merges exact managed source identities and retains target-specific placements", () => {
  const result = aggregateTargetSkillGroups({
    groups: [
      buildTargetSkillGroup({
        target: { id: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex" },
        skills: [{ name: "alpha", kind: "managed-copy", status: "managed", targetPath: "/codex/alpha", sourceId: "source:alpha" }],
      }),
      buildTargetSkillGroup({
        target: { id: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude" },
        skills: [{ name: "alpha", kind: "managed-symlink", status: "managed", targetPath: "/claude/alpha", sourceId: "source:alpha" }],
      }),
    ],
  });

  assert.deepEqual(result, [{
    id: "managed:source:alpha",
    name: "alpha",
    kind: "managed",
    status: "managed",
    sourceId: "source:alpha",
    clientBadges: ["claude", "codex"],
    placements: [
      { targetId: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude", appliedSkill: { name: "alpha", kind: "managed-symlink", status: "managed", targetPath: "/claude/alpha", sourceId: "source:alpha" } },
      { targetId: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex", appliedSkill: { name: "alpha", kind: "managed-copy", status: "managed", targetPath: "/codex/alpha", sourceId: "source:alpha" } },
    ],
  }]);
});

test("aggregateTargetSkillGroups merges external placements only when normalized names and content hashes match", () => {
  const result = aggregateTargetSkillGroups({
    groups: [
      buildTargetSkillGroup({ target: { id: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex" }, skills: [{ name: " Alpha ", kind: "external", status: "external", targetPath: "/codex/alpha", sourceId: null, contentHash: "same" }] }),
      buildTargetSkillGroup({ target: { id: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude" }, skills: [{ name: "alpha", kind: "external", status: "external", targetPath: "/claude/alpha", sourceId: null, contentHash: "same" }] }),
      buildTargetSkillGroup({ target: { id: "global:other", clientType: "other", scope: "global", targetPath: "/other" }, skills: [{ name: "alpha", kind: "external", status: "external", targetPath: "/other/alpha", sourceId: null, contentHash: "different" }] }),
    ],
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].placements.length, 2);
  assert.equal(result[0].id, "external:alpha:same");
  assert.equal(result[1].id, "external:alpha:different");
});

test("refreshSkills hashes readable external target content before aggregating same-name placements", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [
        { id: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex" },
        { id: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude" },
      ],
      projectTargets: [],
    },
    skillRepository: { async scanSourceSkills() { return { ok: true, sources: [] }; } },
    targetStore: {
      async scanAppliedSkills({ targetPath }) {
        return { ok: true, appliedSkills: [{ name: "external", kind: "external", targetPath: `${targetPath}/external` }], diagnostics: [] };
      },
    },
    hashPort: {
      async hashDirectoryWithinRoot({ rootPath, directoryPath }) {
        assert.equal(directoryPath, `${rootPath}/external`);
        return { ok: true, hash: "shared-external-content" };
      },
    },
  });

  assert.equal(result.readModel.globalSkills.length, 1);
  assert.equal(result.readModel.globalSkills[0].id, "external:external:shared-external-content");
  assert.deepEqual(result.readModel.globalSkills[0].clientBadges, ["claude", "codex"]);
});

test("refreshSkills keeps same-name external placements separate and reports a diagnostic when target-bound hashing fails", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [
        { id: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex" },
        { id: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude" },
      ],
      projectTargets: [],
    },
    skillRepository: { async scanSourceSkills() { return { ok: true, sources: [] }; } },
    targetStore: {
      async scanAppliedSkills({ targetPath }) {
        return { ok: true, appliedSkills: [{ name: "external", kind: "external", targetPath: `${targetPath}/external` }], diagnostics: [] };
      },
    },
    hashPort: {
      async hashDirectoryWithinRoot() {
        return { ok: false, error: { code: "directory-hash-outside-target-root" } };
      },
    },
  });

  assert.equal(result.readModel.globalSkills.length, 2);
  assert.equal(result.readModel.diagnostics.filter((diagnostic) => diagnostic.code === "external-content-hash-unavailable").length, 2);
});

test("refreshSkills marks main repository sources inactive before explicit apply", async () => {
  const calls = [];
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills(input) {
        calls.push(["scanSourceSkills", input]);
        return {
          ok: true,
          sources: [
            source("alpha", "/repo/skills/alpha"),
            source("beta", "/repo/skills/beta"),
          ],
        };
      },
    },
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [["scanSourceSkills", { repositoryPath: "/repo" }]]);
  assert.deepEqual(result.readModel.mainRepositorySkills, [
    {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
      status: "inactive",
      appliedTargets: [],
    },
    {
      id: "beta",
      name: "beta",
      sourcePath: "/repo/skills/beta",
      status: "inactive",
      appliedTargets: [],
    },
  ]);
  assert.deepEqual(result.readModel.globalSkills, []);
  assert.deepEqual(result.readModel.projectSkills, []);
  assert.deepEqual(result.readModel.diagnostics, []);
  assert.deepEqual(result.events, [
    {
      level: "ProductLog",
      code: "skills.refresh.completed",
      sourceCount: 2,
      targetCount: 0,
      appliedSkillCount: 0,
      diagnosticCount: 0,
    },
  ]);
  assert.deepEqual(result.steps, [
    "LoadingSources",
    "LoadingTargets",
    "MatchingSources",
    "CalculatingReadModel",
    "Completed",
  ]);
});

test("refreshSkills includes backup catalog when repository exposes backup scan", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
      async scanBackups(input) {
        assert.deepEqual(input, { repositoryPath: "/repo" });
        return {
          ok: true,
          backups: [
            {
              skillName: "alpha",
              snapshotId: "snapshot-001",
              backupPath: "/repo/backups/alpha/snapshot-001",
            },
          ],
        };
      },
    },
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.backups, [
    {
      skillName: "alpha",
      snapshotId: "snapshot-001",
      backupPath: "/repo/backups/alpha/snapshot-001",
    },
  ]);
});

test("refreshSkills includes persisted analysis metadata in source read model and diagnostics", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    analysisStore: {
      async readAnalysisMetadata(input) {
        assert.deepEqual(input, {
          repositoryPath: "/repo",
          skillId: "alpha",
        });
        return {
          ok: true,
          metadata: {
            schemaVersion: 1,
            analyzerVersion: "test-analyzer",
            skillId: "alpha",
            skillName: "alpha",
            sourceHash: "source-hash-alpha",
            analyzedAt: "2026-07-01T00:00:00.000Z",
            riskLevel: "high",
            diagnostics: [
              {
                code: "external-dependencies-detected",
                severity: "warning",
                category: "dependency",
                riskLevel: "medium",
                message: "Skill declares external dependencies.",
                recommendation: "Review dependencies before applying.",
              },
            ],
            dependencies: ["curl"],
            compatibility: { codex: "compatible" },
          },
        };
      },
    },
    hashPort: hashPortWith({
      "/repo/skills/alpha": "source-hash-alpha",
    }),
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.mainRepositorySkills, [
    {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
      status: "inactive",
      appliedTargets: [],
      sourceHash: "source-hash-alpha",
      riskLevel: "high",
      lastAnalyzedAt: "2026-07-01T00:00:00.000Z",
      analysisStatus: "current",
      diagnostics: [
        {
          code: "external-dependencies-detected",
          severity: "warning",
          category: "dependency",
          riskLevel: "medium",
          message: "Skill declares external dependencies.",
          recommendation: "Review dependencies before applying.",
          sourceId: "alpha",
          skillName: "alpha",
        },
      ],
      dependencies: ["curl"],
      compatibility: { codex: "compatible" },
    },
  ]);
  assert.deepEqual(result.readModel.diagnostics, [
    {
      code: "external-dependencies-detected",
      severity: "warning",
      category: "dependency",
      riskLevel: "medium",
      message: "Skill declares external dependencies.",
      recommendation: "Review dependencies before applying.",
      sourceId: "alpha",
      skillName: "alpha",
    },
  ]);
  assert.deepEqual(result.steps, [
    "LoadingSources",
    "HashingSources",
    "LoadingAnalysisMetadata",
    "LoadingTargets",
    "MatchingSources",
    "CalculatingReadModel",
    "Completed",
  ]);
});

test("refreshSkills applies repository index identity and writes refreshed index metadata", async () => {
  const writes = [];
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    repositoryIndexStore: {
      async readRepositoryIndex(input) {
        assert.deepEqual(input, { repositoryPath: "/repo" });
        return {
          ok: true,
          index: {
            schemaVersion: 1,
            indexedAt: "2026-06-30T00:00:00.000Z",
            sources: [
              {
                sourceId: "source-alpha-stable",
                sourceName: "alpha",
                sourcePath: "/repo/skills/alpha",
                origin: "created",
                sourceHash: "old-source-hash",
                indexedAt: "2026-06-30T00:00:00.000Z",
              },
            ],
          },
        };
      },
      async writeRepositoryIndex(input) {
        writes.push(input);
        return {
          ok: true,
          metadataPath: "/repo/.sponzey/index.json",
        };
      },
    },
    hashPort: hashPortWith({
      "/repo/skills/alpha": "source-hash-alpha",
    }),
    now: () => "2026-07-01T00:00:00.000Z",
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.mainRepositorySkills, [
    {
      id: "source-alpha-stable",
      sourceId: "source-alpha-stable",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
      status: "inactive",
      appliedTargets: [],
      sourceHash: "source-hash-alpha",
      origin: "created",
      indexStatus: "indexed",
      lastIndexedAt: "2026-07-01T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(writes, [
    {
      repositoryPath: "/repo",
      index: {
        schemaVersion: 1,
        indexedAt: "2026-07-01T00:00:00.000Z",
        sources: [
          {
            sourceId: "source-alpha-stable",
            sourceName: "alpha",
            sourcePath: "/repo/skills/alpha",
            sourceHash: "source-hash-alpha",
            origin: "created",
            indexStatus: "indexed",
            indexedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      },
    },
  ]);
  assert.deepEqual(result.steps, [
    "LoadingSources",
    "HashingSources",
    "ReadingRepositoryIndex",
    "WritingRepositoryIndex",
    "LoadingTargets",
    "MatchingSources",
    "CalculatingReadModel",
    "Completed",
  ]);
});

test("refreshSkills converts repository index read failure into non-fatal diagnostic", async () => {
  const writes = [];
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    repositoryIndexStore: {
      async readRepositoryIndex() {
        return {
          ok: false,
          error: {
            code: "repository-index-unsupported-version",
            severity: "warning",
            category: "repository",
            message: "Repository index schema version is unsupported.",
          },
        };
      },
      async writeRepositoryIndex(input) {
        writes.push(input);
        return {
          ok: true,
          metadataPath: "/repo/.sponzey/index.json",
        };
      },
    },
    now: () => "2026-07-01T00:00:00.000Z",
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.diagnostics, [
    {
      code: "repository-index-unsupported-version",
      severity: "warning",
      category: "repository",
      message: "Repository index schema version is unsupported.",
    },
  ]);
  assert.deepEqual(writes, []);
  assert.equal(result.readModel.mainRepositorySkills[0].indexStatus, "unknown");
});

test("refreshSkills includes repository version summary when version control port is available", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    versionControlPort: {
      async getRepositoryStatus(input) {
        assert.deepEqual(input, { repositoryPath: "/repo" });
        return {
          ok: true,
          status: "dirty",
          checkedAt: "2026-07-01T00:00:00.000Z",
          entries: [
            {
              path: "skills/alpha/SKILL.md",
              status: "modified",
            },
            {
              path: "backups/alpha/snapshot-001/SKILL.md",
              status: "added",
            },
            {
              path: ".sponzey/index.json",
              status: "modified",
            },
          ],
        };
      },
    },
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.repositoryVersion, {
    status: "dirty",
    changedFileCount: 3,
    sourceChangeCount: 1,
    backupChangeCount: 1,
    metadataChangeCount: 1,
    lastCheckedAt: "2026-07-01T00:00:00.000Z",
  });
  assert.deepEqual(result.readModel.diagnostics, []);
  assert.deepEqual(result.steps, [
    "LoadingSources",
    "CheckingVersionStatus",
    "LoadingTargets",
    "MatchingSources",
    "CalculatingReadModel",
    "Completed",
  ]);
});

test("refreshSkills converts version status failure into non-fatal repository version diagnostic", async () => {
  const diagnostic = {
    code: "git-unavailable",
    severity: "warning",
    category: "version-control",
    message: "Git command is unavailable.",
  };
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    versionControlPort: {
      async getRepositoryStatus() {
        return {
          ok: false,
          error: diagnostic,
        };
      },
    },
    now: () => "2026-07-01T00:00:00.000Z",
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.repositoryVersion, {
    status: "unavailable",
    changedFileCount: 0,
    sourceChangeCount: 0,
    backupChangeCount: 0,
    metadataChangeCount: 0,
    lastCheckedAt: "2026-07-01T00:00:00.000Z",
  });
  assert.deepEqual(result.readModel.diagnostics, [diagnostic]);
});

test("refreshSkills marks persisted analysis stale without failing refresh", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    analysisStore: {
      async readAnalysisMetadata() {
        return {
          ok: true,
          metadata: {
            schemaVersion: 1,
            analyzerVersion: "test-analyzer",
            skillId: "alpha",
            skillName: "alpha",
            sourceHash: "old-source-hash",
            analyzedAt: "2026-07-01T00:00:00.000Z",
            riskLevel: "low",
            diagnostics: [],
            dependencies: [],
            compatibility: {},
          },
        };
      },
    },
    hashPort: hashPortWith({
      "/repo/skills/alpha": "new-source-hash",
    }),
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.readModel.mainRepositorySkills[0].analysisStatus,
    "stale",
  );
  assert.equal(result.readModel.mainRepositorySkills[0].sourceHash, "new-source-hash");
  assert.equal(
    result.readModel.mainRepositorySkills[0].lastAnalyzedSourceHash,
    "old-source-hash",
  );
  assert.deepEqual(result.readModel.diagnostics, []);
});

test("refreshSkills reports invalid analysis metadata as non-fatal diagnostic", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    analysisStore: {
      async readAnalysisMetadata() {
        return {
          ok: false,
          error: {
            code: "analysis-metadata-unsupported-version",
            severity: "warning",
            category: "analysis",
            message: "Analysis metadata schema version is unsupported.",
            recommendation: "Run Analyze All Skills again.",
          },
        };
      },
    },
    targetStore: failIfCalledTargetStore(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.readModel.mainRepositorySkills[0].analysisStatus,
    "unknown",
  );
  assert.deepEqual(result.readModel.diagnostics, [
    {
      code: "analysis-metadata-unsupported-version",
      severity: "warning",
      category: "analysis",
      message: "Analysis metadata schema version is unsupported.",
      recommendation: "Run Analyze All Skills again.",
      sourceId: "alpha",
      skillName: "alpha",
    },
  ]);
});

test("refreshSkills aggregates managed, external, and broken target read models", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [
        {
          id: "global:codex",
          clientType: "codex",
          scope: "global",
          targetPath: "/global",
        },
      ],
      projectTargets: [
        {
          id: "project:/workspace:.agents/skills",
          clientType: "codex",
          scope: "project",
          workspacePath: "/workspace",
          targetPath: "/workspace/.agents/skills",
        },
      ],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [
            source("alpha", "/repo/skills/alpha"),
            source("beta", "/repo/skills/beta"),
          ],
        };
      },
    },
    targetStore: {
      async scanAppliedSkills({ targetPath }) {
        if (targetPath === "/global") {
          return {
            ok: true,
            appliedSkills: [
              {
                name: "alpha",
                kind: "managed-symlink",
                targetPath: "/global/alpha",
                sourcePath: "/repo/skills/alpha",
              },
              {
                name: "beta-copy",
                kind: "managed-copy",
                targetPath: "/global/beta-copy",
                metadata: {
                  sourcePath: "/repo/skills/beta",
                  applyMode: "copy",
                },
              },
              {
                name: "external",
                kind: "external",
                targetPath: "/global/external",
              },
            ],
            diagnostics: [],
          };
        }

        return {
          ok: true,
          appliedSkills: [
            {
              name: "broken",
              kind: "broken-symlink",
              targetPath: "/workspace/.agents/skills/broken",
            },
          ],
          diagnostics: [
            {
              code: "broken-symlink",
              severity: "warning",
              category: "sync",
              riskLevel: "low",
              message: "Target skill symlink cannot be resolved.",
              recommendation: "Remove the broken link or restore the missing source.",
              skillName: "broken",
            },
          ],
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.readModel.mainRepositorySkills.map((skill) => [
      skill.name,
      skill.status,
      skill.appliedTargets,
    ]),
    [
      [
        "alpha",
        "applied",
        [{ targetId: "global:codex", kind: "managed-symlink" }],
      ],
      [
        "beta",
        "applied",
        [{ targetId: "global:codex", kind: "managed-copy" }],
      ],
    ],
  );
  assert.deepEqual(result.readModel.globalSkills.map((skill) => [skill.id, skill.name, skill.placements.length]), [
    ["managed:alpha", "alpha", 1],
    ["managed:beta", "beta-copy", 1],
    ["unresolved:0", "external", 1],
  ]);
  assert.deepEqual(result.readModel.projectSkills, []);
  assert.deepEqual(result.readModel.diagnostics, [
    {
      code: "broken-symlink",
      severity: "warning",
      category: "sync",
      riskLevel: "low",
      message: "Target skill symlink cannot be resolved.",
      recommendation: "Remove the broken link or restore the missing source.",
      skillName: "broken",
      targetId: "project:/workspace:.agents/skills",
      targetPath: "/workspace/.agents/skills",
    },
  ]);
  assert.deepEqual(result.events, [
    {
      level: "FieldDebugLog",
      code: "target.scan.completed",
      targetId: "global:codex",
      scope: "global",
      state: "Completed",
      appliedSkillCount: 3,
      diagnosticCount: 0,
    },
    {
      level: "FieldDebugLog",
      code: "target.scan.completed",
      targetId: "project:/workspace:.agents/skills",
      scope: "project",
      state: "CompletedWithDiagnostics",
      appliedSkillCount: 1,
      diagnosticCount: 1,
    },
    {
      level: "ProductLog",
      code: "skills.refresh.completed",
      sourceCount: 2,
      targetCount: 2,
      appliedSkillCount: 4,
      diagnosticCount: 1,
    },
  ]);
});

test("refreshSkills reports same-client project over global shadowing diagnostics", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [
        {
          id: "global:codex",
          clientType: "codex",
          scope: "global",
          targetPath: "/global/.agents/skills",
        },
      ],
      projectTargets: [
        {
          id: "project:/workspace:.agents/skills",
          clientType: "codex",
          scope: "project",
          workspacePath: "/workspace",
          targetPath: "/workspace/.agents/skills",
          targetPattern: ".agents/skills",
        },
      ],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
        };
      },
    },
    targetStore: {
      async scanAppliedSkills({ targetPath }) {
        return {
          ok: true,
          appliedSkills: [
            {
              name: "alpha",
              kind: "managed-symlink",
              targetPath: `${targetPath}/alpha`,
              sourcePath: "/repo/skills/alpha",
            },
          ],
          diagnostics: [],
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.diagnostics, [
    {
      code: "potential-skill-shadowing",
      severity: "warning",
      category: "conflict",
      riskLevel: "low",
      message:
        "Project skill may shadow a global skill with the same name for the same client.",
      recommendation:
        "Inspect the project and global targets before applying or removing this skill.",
      skillName: "alpha",
      clientType: "codex",
      targetId: "project:/workspace:.agents/skills",
      targetPath: "/workspace/.agents/skills",
      shadowingTargetId: "project:/workspace:.agents/skills",
      shadowedTargetId: "global:codex",
    },
  ]);
  assert.deepEqual(result.steps, [
    "LoadingSources",
    "LoadingTargets",
    "DetectingShadowing",
    "MatchingSources",
    "CalculatingReadModel",
    "Completed",
  ]);
  assert.deepEqual(result.events.at(-1), {
    level: "ProductLog",
    code: "skills.refresh.completed",
    sourceCount: 1,
    targetCount: 2,
    appliedSkillCount: 2,
    diagnosticCount: 1,
  });
});

test("refreshSkills reports source and external target name conflict diagnostics", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [
        {
          id: "global:codex",
          clientType: "codex",
          scope: "global",
          targetPath: "/global/.agents/skills",
        },
      ],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: true,
          sources: [source("alpha", "/repo/skills/alpha")],
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
              kind: "external",
              targetPath: "/global/.agents/skills/alpha",
            },
          ],
          diagnostics: [],
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.diagnostics, [
    {
      code: "source-target-name-conflict",
      severity: "warning",
      category: "conflict",
      riskLevel: "low",
      message:
        "A target skill with this name already exists outside main repository management.",
      recommendation:
        "Back up, move, or remove the existing target skill before applying this source.",
      skillName: "alpha",
      sourceId: "alpha",
      targetId: "global:codex",
      targetPath: "/global/.agents/skills/alpha",
      targetKind: "external",
      preservationPolicy: "preserve-existing-target",
    },
  ]);
  assert.deepEqual(result.steps, [
    "LoadingSources",
    "LoadingTargets",
    "DetectingConflicts",
    "MatchingSources",
    "CalculatingReadModel",
    "Completed",
  ]);
  assert.deepEqual(result.events.at(-1), {
    level: "ProductLog",
    code: "skills.refresh.completed",
    sourceCount: 1,
    targetCount: 1,
    appliedSkillCount: 1,
    diagnosticCount: 1,
  });
});

test("refreshSkills converts source scan failure into diagnostic and product event", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return {
          ok: false,
          error: {
            code: "repository-unreadable",
            severity: "error",
            message: "Repository cannot be read.",
          },
        };
      },
    },
    targetStore: failIfCalledTargetStore(),
  });

  assert.deepEqual(result, {
    ok: false,
    readModel: null,
    diagnostics: [
      {
        code: "repository-unreadable",
        severity: "error",
        message: "Repository cannot be read.",
      },
    ],
    events: [
      {
        level: "ProductLog",
        code: "skills.refresh.failed",
        diagnosticCount: 1,
      },
    ],
    steps: ["LoadingSources", "SourceScanFailed"],
  });
});

test("refreshSkills preserves a successful Claude target when the Codex target is unavailable", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [
        {
          id: "global:codex",
          clientType: "codex",
          scope: "global",
          targetPath: "/codex",
        },
        {
          id: "global:claude",
          clientType: "claude",
          scope: "global",
          targetPath: "/claude",
        },
      ],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return { ok: true, sources: [] };
      },
    },
    targetStore: {
      async scanAppliedSkills({ targetPath }) {
        if (targetPath === "/codex") {
          return {
            ok: false,
            error: {
              code: "filesystem-operation-failed",
              severity: "error",
              message: "Target cannot be read.",
            },
          };
        }
        return {
          ok: true,
          appliedSkills: [
            {
              name: "claude-existing",
              kind: "external",
              targetPath: "/claude/claude-existing",
            },
          ],
          diagnostics: [],
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.readModel.globalSkills.map((skill) => [skill.name, skill.clientBadges]), [
    ["claude-existing", ["claude"]],
  ]);
  assert.equal(result.readModel.diagnostics[0].code, "target-unavailable");
  assert.equal(result.readModel.diagnostics[0].targetId, "global:codex");
  assert.equal(
    result.events.some((event) => event.code === "target.scan.unavailable"),
    true,
  );
  assert.equal(result.steps.includes("TargetScanFailed"), false);
});

test("refreshSkills keeps duplicate same-client target skills and reports their conflict", async () => {
  const result = await refreshSkills({
    context: {
      mainRepositoryPath: "/repo",
      globalTargets: [
        {
          id: "global:codex:standard",
          clientType: "codex",
          scope: "global",
          targetPath: "/standard",
        },
        {
          id: "global:codex:configured",
          clientType: "codex",
          scope: "global",
          targetPath: "/configured",
        },
      ],
      projectTargets: [],
    },
    skillRepository: {
      async scanSourceSkills() {
        return { ok: true, sources: [] };
      },
    },
    targetStore: {
      async scanAppliedSkills({ targetPath }) {
        return {
          ok: true,
          appliedSkills: [
            {
              name: "shared",
              kind: "external",
              targetPath: `${targetPath}/shared`,
            },
          ],
          diagnostics: [],
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.readModel.globalSkills.length, 2);
  assert.equal(result.readModel.globalSkills.every((skill) => skill.name === "shared"), true);
  assert.equal(
    result.readModel.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "duplicate-target-skill" &&
        diagnostic.clientType === "codex" &&
        diagnostic.skillName === "shared",
    ),
    true,
  );
});

function source(name, sourcePath) {
  return {
    id: name,
    name,
    sourcePath,
  };
}

function failIfCalledTargetStore() {
  return {
    async scanAppliedSkills() {
      throw new Error("target store must not be called");
    },
  };
}

function hashPortWith(hashByDirectoryPath) {
  return {
    async hashDirectory({ directoryPath }) {
      return {
        ok: true,
        hash: hashByDirectoryPath[directoryPath],
      };
    },
  };
}
