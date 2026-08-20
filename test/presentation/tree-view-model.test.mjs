import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  SPONZEY_TREE_VIEWS,
  mapSkillsReadModelToTreeItems,
} from "../../src/presentation/tree-view-model.js";

test("tree view descriptors match package view contributions", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const contributedViews = packageJson.contributes.views.sponzeySkills.map(
    (view) => viewDescriptor(view),
  );

  assert.deepEqual(contributedViews, SPONZEY_TREE_VIEWS);
});

test("mapSkillsReadModelToTreeItems maps read model into four root sections", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [
      {
        id: "alpha",
        name: "alpha",
        status: "applied",
        sourcePath: "/repo/skills/alpha",
      },
    ],
    globalSkills: [
      {
        targetId: "global:codex",
        clientType: "codex",
        scope: "global",
        targetPath: "/global",
        skills: [
          {
            name: "alpha",
            kind: "managed-symlink",
            status: "managed",
            targetPath: "/global/alpha",
            sourceId: "alpha",
          },
        ],
      },
    ],
    projectSkills: [
      {
        targetId: "project:/workspace:.agents/skills",
        clientType: "codex",
        scope: "project",
        targetPath: "/workspace/.agents/skills",
        skills: [
          {
            name: "external",
            kind: "external",
            status: "external",
            targetPath: "/workspace/.agents/skills/external",
            sourceId: null,
          },
        ],
      },
    ],
    diagnostics: [
      {
        code: "broken-symlink",
        severity: "warning",
        category: "sync",
        message: "Target skill symlink cannot be resolved.",
        sourceId: "alpha",
      },
    ],
  });

  assert.deepEqual(
    tree.map((item) => item.id),
    [
      "mainRepositorySkills",
      "globalSkills",
      "projectSkills",
      "diagnostics",
    ],
  );
  assert.equal(tree[0].children[0].label, "alpha");
  assert.equal(tree[0].children[0].iconId, "repo");
  assert.equal(tree[1].children[0].iconId, "agent-codex");
  assert.equal(tree[1].children[0].label, "alpha");
  assert.equal(tree[1].children[0].description, "Codex · managed-symlink");
  assert.equal(tree[2].children[0].iconId, "agent-codex");
  assert.equal(tree[2].children[0].label, "external");
  assert.equal(
    tree[2].children[0].description,
    "Codex · .agents/skills · external",
  );
  assert.equal(
    tree[2].children[0].detail,
    ".agents/skills -> /workspace/.agents/skills/external",
  );
  assert.equal(tree[3].children[0].iconId, "warning");
  assert.equal(tree[3].children[0].label, "warning");
  assert.equal(tree[3].children[0].children[0].label, "sync");
  assert.equal(tree[3].children[0].children[0].description, "1 item");
  assert.equal(tree[3].children[0].children[0].children[0].label, "broken-symlink");
  assert.equal(
    tree[3].children[0].children[0].children[0].description,
    "alpha · warning",
  );
});

test("mapSkillsReadModelToTreeItems renders one flat Global enrollment row with its source payload", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [{ id: "alpha", name: "alpha", sourcePath: "/repo/alpha" }],
    globalSkills: [{
      id: "managed:alpha",
      name: "alpha",
      kind: "managed",
      status: "managed",
      sourceId: "alpha",
      clientBadges: ["claude", "codex"],
      placements: [
        { targetId: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude", appliedSkill: { name: "alpha", kind: "managed-copy", status: "managed", targetPath: "/claude/alpha", sourceId: "alpha" } },
        { targetId: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex", appliedSkill: { name: "alpha", kind: "managed-symlink", status: "managed", targetPath: "/codex/alpha", sourceId: "alpha" } },
      ],
    }],
    projectSkills: [],
    diagnostics: [],
  });

  const aggregate = tree[1].children[0];
  assert.equal(aggregate.label, "alpha");
  assert.equal(aggregate.description, "managed · 2 targets");
  assert.equal(aggregate.iconId, "organization");
  assert.equal(aggregate.contextValue, "sponzeyGlobalEnrollment");
  assert.equal(aggregate.collapsible, false);
  assert.deepEqual(aggregate.children, []);
  assert.deepEqual(aggregate.source, { id: "alpha", name: "alpha", sourcePath: "/repo/alpha" });
});

test("mapSkillsReadModelToTreeItems includes command payloads and context values", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [
      {
        id: "alpha",
        name: "alpha",
        status: "inactive",
        sourcePath: "/repo/skills/alpha",
      },
    ],
    globalSkills: [
      {
        targetId: "global:codex",
        clientType: "codex",
        scope: "global",
        targetPath: "/global",
        skills: [
          {
            name: "external",
            kind: "external",
            status: "external",
            targetPath: "/global/external",
            sourceId: null,
          },
        ],
      },
    ],
    projectSkills: [],
    diagnostics: [],
  });

  const sourceItem = tree[0].children[0];
  const appliedSkillItem = tree[1].children[0];

  assert.equal(sourceItem.contextValue, "sponzeySkillSource");
  assert.deepEqual(sourceItem.source, {
    id: "alpha",
    name: "alpha",
    sourcePath: "/repo/skills/alpha",
  });
  assert.equal(appliedSkillItem.contextValue, "sponzeyAppliedSkill");
  assert.deepEqual(appliedSkillItem.target, {
    id: "global:codex",
    clientType: "codex",
    scope: "global",
    targetPath: "/global",
    workspacePath: undefined,
    targetPattern: undefined,
  });
  assert.deepEqual(appliedSkillItem.appliedSkill, {
    name: "external",
    kind: "external",
    status: "external",
    targetPath: "/global/external",
    sourceId: null,
  });
});

test("mapSkillsReadModelToTreeItems preserves diagnostic DTO payloads", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [],
    globalSkills: [],
    projectSkills: [],
    diagnostics: [
      {
        code: "external-dependencies-detected",
        severity: "warning",
        category: "dependency",
        riskLevel: "low",
        message: "Skill declares external dependencies.",
        recommendation: "Review external dependencies before applying this skill.",
        sourceId: "alpha",
        targetId: "global:codex",
        dependencyCount: 2,
      },
    ],
  });

  const diagnosticItem = tree[3].children[0].children[0].children[0];

  assert.deepEqual(diagnosticItem.diagnostic, {
    code: "external-dependencies-detected",
    severity: "warning",
    category: "dependency",
    riskLevel: "low",
    message: "Skill declares external dependencies.",
    recommendation: "Review external dependencies before applying this skill.",
    sourceId: "alpha",
    targetId: "global:codex",
    dependencyCount: 2,
  });
});

test("mapSkillsReadModelToTreeItems exposes diagnostic remediation action summary", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [
      {
        id: "alpha",
        name: "alpha",
        status: "inactive",
        sourcePath: "/repo/skills/alpha",
      },
    ],
    globalSkills: [],
    projectSkills: [],
    diagnostics: [
      {
        code: "destructive-rm-rf",
        severity: "error",
        category: "security",
        riskLevel: "critical",
        message: "Destructive remove command detected.",
        sourceId: "alpha",
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
        blockedActions: [
          {
            code: "apply-skill-to-target",
            reason: "critical-risk-blocked",
            mutatesTarget: true,
            requiresConfirmation: false,
            safety: "blocked",
          },
        ],
      },
    ],
  });

  const diagnosticItem = tree[3].children[0].children[0].children[0];

  assert.equal(diagnosticItem.contextValue, "sponzeyDiagnosticWithSource");
  assert.deepEqual(diagnosticItem.diagnosticActions, {
    allowedActionCodes: ["open-skill-md", "analyze-again"],
    blockedActionCodes: ["apply-skill-to-target"],
    confirmationRequiredActionCodes: [],
    hasBlockedActions: true,
    hasMutatingAllowedActions: false,
  });
  assert.deepEqual(
    diagnosticItem.diagnostic.blockedActions.map((action) => action.reason),
    ["critical-risk-blocked"],
  );
});

test("mapSkillsReadModelToTreeItems groups diagnostics and attaches source action payloads", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [
      {
        id: "alpha",
        name: "alpha",
        status: "inactive",
        sourcePath: "/repo/skills/alpha",
        riskLevel: "high",
        analysisStatus: "stale",
      },
    ],
    globalSkills: [],
    projectSkills: [],
    diagnostics: [
      {
        code: "policy-override-detected",
        severity: "error",
        category: "security",
        riskLevel: "critical",
        message: "Skill attempts to override policy.",
        recommendation: "Do not apply this skill.",
        sourceId: "alpha",
      },
      {
        code: "repository-unreadable",
        severity: "warning",
        category: "repository",
        message: "Repository cannot be read.",
      },
    ],
  });

  assert.equal(tree[0].children[0].description, "inactive · analysis stale");

  const errorGroup = tree[3].children[0];
  const warningGroup = tree[3].children[1];
  const securityGroup = errorGroup.children[0];
  const repositoryGroup = warningGroup.children[0];
  const sourceDiagnosticItem = securityGroup.children[0];
  const repositoryDiagnosticItem = repositoryGroup.children[0];

  assert.equal(errorGroup.label, "error");
  assert.equal(errorGroup.iconId, "error");
  assert.equal(securityGroup.label, "security");
  assert.equal(sourceDiagnosticItem.contextValue, "sponzeyDiagnosticWithSource");
  assert.deepEqual(sourceDiagnosticItem.source, {
    id: "alpha",
    name: "alpha",
    sourcePath: "/repo/skills/alpha",
    riskLevel: "high",
    analysisStatus: "stale",
  });
  assert.deepEqual(sourceDiagnosticItem.diagnostic, {
    code: "policy-override-detected",
    severity: "error",
    category: "security",
    riskLevel: "critical",
    message: "Skill attempts to override policy.",
    recommendation: "Do not apply this skill.",
    sourceId: "alpha",
  });
  assert.equal(warningGroup.label, "warning");
  assert.equal(repositoryGroup.label, "repository");
  assert.equal(repositoryDiagnosticItem.contextValue, "sponzeyDiagnostic");
  assert.equal(repositoryDiagnosticItem.source, undefined);
});

test("mapSkillsReadModelToTreeItems maps backup catalog under main repository", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [],
    backups: [
      {
        skillName: "alpha",
        snapshotId: "snapshot-001",
        backupPath: "/repo/backups/alpha/snapshot-001",
        createdAt: "2026-06-30T00:00:00.000Z",
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
    ],
    globalSkills: [],
    projectSkills: [],
    diagnostics: [],
  });

  const backupSection = tree[0].children[0];
  const backupItem = backupSection.children[0];

  assert.equal(backupSection.id, "backupSnapshots");
  assert.equal(backupItem.contextValue, "sponzeySkillBackup");
  assert.equal(backupItem.iconId, "archive");
  assert.deepEqual(backupItem.backup, {
    skillName: "alpha",
    snapshotId: "snapshot-001",
    backupPath: "/repo/backups/alpha/snapshot-001",
    createdAt: "2026-06-30T00:00:00.000Z",
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
  });
});

test("mapSkillsReadModelToTreeItems hides empty project targets from flat skill list", () => {
  const readModel = {
    mainRepositorySkills: [],
    globalSkills: [],
    projectSkills: [
      {
        targetId: "project:/workspace:.agents/skills",
        clientType: "codex",
        scope: "project",
        targetPath: "/workspace/.agents/skills",
        targetPattern: ".agents/skills",
        skills: [],
      },
    ],
    diagnostics: [],
  };
  const tree = mapSkillsReadModelToTreeItems(readModel);

  assert.deepEqual(tree[2].children, []);
});

test("mapSkillsReadModelToTreeItems uses agent badges for Claude targets", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [],
    globalSkills: [
      {
        targetId: "global:claude:/global/claude",
        clientType: "claude",
        scope: "global",
        targetPath: "/global/claude",
        skills: [
          {
            name: "global-claude-skill",
            kind: "managed-copy",
            status: "managed",
            targetPath: "/global/claude/global-claude-skill",
            sourceId: "global-claude-skill",
          },
        ],
      },
    ],
    projectSkills: [
      {
        targetId: "project:/workspace:.claude/skills",
        clientType: "claude",
        scope: "project",
        targetPath: "/workspace/.claude/skills",
        targetPattern: ".claude/skills",
        skills: [
          {
            name: "claude-skill",
            kind: "external",
            status: "external",
            targetPath: "/workspace/.claude/skills/claude-skill",
            sourceId: null,
          },
        ],
      },
    ],
    diagnostics: [],
  });

  assert.equal(tree[1].children[0].iconId, "agent-claude");
  assert.equal(tree[1].children[0].label, "global-claude-skill");
  assert.equal(tree[1].children[0].description, "Claude · managed-copy");
  assert.equal(tree[2].children[0].iconId, "agent-claude");
  assert.equal(tree[2].children[0].label, "claude-skill");
  assert.equal(
    tree[2].children[0].description,
    "Claude · .claude/skills · external",
  );
});

test("mapSkillsReadModelToTreeItems keeps an unsupported aggregate readable for the Global Skills webview", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [],
    globalSkills: [{
      id: "external:alpha:hash",
      name: "alpha",
      kind: "external",
      clientBadges: ["unknown-ai"],
      placements: [{
        targetId: "global:unknown",
        clientType: "unknown-ai",
        scope: "global",
        targetPath: "/unknown",
        appliedSkill: { name: "alpha", kind: "external", status: "external", targetPath: "/unknown/alpha" },
      }],
    }],
    projectSkills: [],
    diagnostics: [],
  });

  assert.equal(tree[1].children[0].iconId, "organization");
  assert.equal(tree[1].children[0].description, "external · 1 target");
});

test("partial target failure keeps readable skill and shows beginner action in diagnostics", () => {
  const tree = mapSkillsReadModelToTreeItems({
    mainRepositorySkills: [],
    globalSkills: [
      {
        targetId: "global:claude",
        clientType: "claude",
        scope: "global",
        targetPath: "/home/test/.claude/skills",
        skills: [
          {
            name: "existing",
            kind: "external",
            status: "external",
            targetPath: "/home/test/.claude/skills/existing",
            sourceId: null,
          },
        ],
      },
    ],
    projectSkills: [],
    diagnostics: [
      {
        code: "target-unavailable",
        severity: "warning",
        category: "target",
        message: "Existing skills could not be read from this target.",
        recommendation: "Check the target permissions, then refresh.",
        targetId: "global:codex",
        targetPath: "/home/test/.agents/skills",
      },
    ],
  });

  assert.equal(tree[1].children[0].label, "existing");
  const diagnostic = tree[3].children[0].children[0].children[0];
  assert.match(diagnostic.detail, /Next: Check the target permissions/);
  assert.equal(diagnostic.diagnostic.targetPath, "/home/test/.agents/skills");
});

test("package contributes expected tree item context menus", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const menuCommands = packageJson.contributes.menus["view/item/context"].map(
    (item) => ({
      command: item.command,
      when: item.when,
      group: item.group,
    }),
  );

  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.removeGlobalSkillEnrollment" &&
        item.when ===
          "view == sponzeySkills.globalSkills && viewItem == sponzeyGlobalEnrollment",
    ),
    true,
  );

  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.openSkillMd" &&
        item.when ===
          "view == sponzeySkills.mainRepository && viewItem == sponzeySkillSource",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.showSkillDetail" &&
        item.when ===
          "view == sponzeySkills.diagnostics && viewItem == sponzeyDiagnosticWithSource",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.openSkillMd" &&
        item.when ===
          "view == sponzeySkills.diagnostics && viewItem == sponzeyDiagnosticWithSource",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.updateAppliedCopyFromSource" &&
        item.when ===
          "view == sponzeySkills.globalSkills && viewItem == sponzeyAppliedSkill",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.convertAppliedSkillMode" &&
        item.when ===
          "view == sponzeySkills.projectSkills && viewItem == sponzeyAppliedSkill",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.deleteSourceSkill" &&
        item.group === "source@3",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.showSkillDetail" &&
        item.when ===
          "view == sponzeySkills.mainRepository && viewItem == sponzeySkillBackup",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.compareSkillBackup" &&
        item.when ===
          "view == sponzeySkills.mainRepository && viewItem == sponzeySkillBackup",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.restoreBackupToTarget" &&
        item.group === "backup@2",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.promoteBackupToSkillSource" &&
        item.group === "backup@3",
    ),
    true,
  );
  assert.equal(
    menuCommands.some(
      (item) =>
        item.command === "sponzeySkills.deleteBackup" &&
        item.group === "backup@4",
    ),
    true,
  );
});

test("package contributes repository management view title buttons", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const titleMenus = packageJson.contributes.menus["view/title"].map((item) => ({
    command: item.command,
    when: item.when,
    group: item.group,
  }));
  const contextMenus = packageJson.contributes.menus["view/item/context"].map(
    (item) => ({
      command: item.command,
      when: item.when,
      group: item.group,
    }),
  );
  const commandById = new Map(
    packageJson.contributes.commands.map((command) => [
      command.command,
      command,
    ]),
  );

  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.refreshSkills" &&
        item.when === "view == sponzeySkills.mainRepository" &&
        item.group === "navigation@0",
    ),
    true,
  );
  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.importSkillArchive" &&
        item.when === "view == sponzeySkills.mainRepository" &&
        item.group === "navigation@3",
    ),
    true,
  );
  assert.equal(
    commandById.get("sponzeySkills.importSkillArchive")?.icon,
    "$(file-zip)",
  );
  assert.equal(
    commandById.get("sponzeySkills.analyzeAllSkills")?.icon,
    "$(shield)",
  );
  assert.equal(
    commandById.get("sponzeySkills.listSkillBackups")?.icon,
    "$(archive)",
  );
  assert.equal(
    commandById.get("sponzeySkills.runDiagnosticAction")?.icon,
    "$(play)",
  );
  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.analyzeAllSkills" &&
        item.when === "view == sponzeySkills.mainRepository",
    ),
    true,
  );
  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.refreshSkills" &&
        item.when === "view == sponzeySkills.globalSkills" &&
        item.group === "navigation@0",
    ),
    true,
  );
  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.addGlobalRepository" &&
        item.when === "view == sponzeySkills.globalSkills",
    ),
    true,
  );
  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.refreshSkills" &&
        item.when === "view == sponzeySkills.projectSkills" &&
        item.group === "navigation@0",
    ),
    true,
  );
  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.addProjectRepository" &&
        item.when === "view == sponzeySkills.projectSkills",
    ),
    true,
  );
  assert.equal(
    titleMenus.some(
      (item) =>
        item.command === "sponzeySkills.refreshSkills" &&
        item.when === "view == sponzeySkills.diagnostics" &&
        item.group === "navigation@0",
      ),
    true,
  );
  assert.equal(
    contextMenus.some(
      (item) =>
        item.command === "sponzeySkills.runDiagnosticAction" &&
        item.when ===
          "view == sponzeySkills.diagnostics && viewItem == sponzeyDiagnosticWithSource" &&
        item.group === "navigation@1",
    ),
    true,
  );
  assert.equal(
    contextMenus.some(
      (item) =>
        item.command === "sponzeySkills.runDiagnosticAction" &&
        item.when ===
          "view == sponzeySkills.diagnostics && viewItem == sponzeyDiagnostic" &&
        item.group === "navigation@0",
    ),
    true,
  );
  for (const item of titleMenus) {
    assert.match(commandById.get(item.command)?.icon ?? "", /^\$\(.+\)$/);
  }
});

function viewDescriptor(view) {
  const descriptor = {
    id: view.id,
    name: view.name,
  };

  if (view.when !== undefined) {
    descriptor.when = view.when;
  }

  return descriptor;
}
