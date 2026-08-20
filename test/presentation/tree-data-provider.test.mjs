import test from "node:test";
import assert from "node:assert/strict";

import {
  SPONZEY_TREE_VIEWS,
  createSkillsTreeDataProvider,
  createSkillsTreeDataProviders,
  refreshSponzeyTreeDataProviders,
  registerSponzeyTreeDataProviders,
} from "../../src/presentation/tree-data-provider.js";

test("main repository tree provider loads source skill children", async () => {
  let loadCount = 0;
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.mainRepository",
    async loadReadModel() {
      loadCount += 1;
      return sampleReadModel();
    },
  });

  const children = await provider.getChildren();
  const treeItem = provider.getTreeItem(children[0]);
  const cachedChildren = await provider.getChildren();

  assert.equal(loadCount, 1);
  assert.deepEqual(
    children.map((item) => item.label),
    ["alpha"],
  );
  assert.equal(cachedChildren, children);
  assert.deepEqual(treeItem, {
    id: "source:alpha",
    label: "alpha",
    description: "applied",
    tooltip: "/repo/skills/alpha",
    iconPath: { id: "repo" },
    contextValue: "sponzeySkillSource",
    collapsibleState: 0,
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
  });
});

test("main repository tree items preserve the selected source payload", async () => {
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.mainRepository",
    async loadReadModel() {
      return {
        ...sampleReadModel(),
        mainRepositorySkills: [
          {
            id: "alpha",
            name: "alpha",
            status: "inactive",
            sourcePath: "/repo/skills/alpha",
          },
          {
            id: "beta",
            name: "beta",
            status: "inactive",
            sourcePath: "/repo/skills/beta",
          },
        ],
      };
    },
  });

  const children = await provider.getChildren();
  const selectedTreeItem = provider.getTreeItem(children[1]);

  assert.deepEqual(selectedTreeItem.source, {
    id: "beta",
    name: "beta",
    sourcePath: "/repo/skills/beta",
  });
});

test("tree provider converts icon ids with provided theme icon factory", async () => {
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.mainRepository",
    async loadReadModel() {
      return sampleReadModel();
    },
    themeIconFactory(iconId) {
      return {
        themeIcon: iconId,
      };
    },
  });

  const children = await provider.getChildren();
  const treeItem = provider.getTreeItem(children[0]);

  assert.deepEqual(treeItem.iconPath, {
    themeIcon: "repo",
  });
});

test("tree provider keeps the existing left icon when client icons are rendered in the description", async () => {
  const iconRequests = [];
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.globalSkills",
    async loadReadModel() {
      return {
        mainRepositorySkills: [],
        globalSkills: [{
          id: "managed:alpha",
          name: "alpha",
          kind: "managed",
          clientBadges: ["claude", "codex"],
          placements: [
            { targetId: "global:claude", clientType: "claude", scope: "global", targetPath: "/claude", appliedSkill: { name: "alpha", kind: "managed-copy", status: "managed", targetPath: "/claude/alpha", sourceId: "alpha" } },
            { targetId: "global:codex", clientType: "codex", scope: "global", targetPath: "/codex", appliedSkill: { name: "alpha", kind: "managed-copy", status: "managed", targetPath: "/codex/alpha", sourceId: "alpha" } },
          ],
        }],
        projectSkills: [],
        diagnostics: [],
      };
    },
    themeIconFactory(icon) { iconRequests.push(icon); return { icon }; },
  });

  const [aggregate] = await provider.getChildren();
  provider.getTreeItem(aggregate);

  assert.deepEqual(iconRequests, ["organization"]);
});

test("global skills tree provider returns applied skills with agent badges", async () => {
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.globalSkills",
    async loadReadModel() {
      return sampleReadModel();
    },
  });

  const skills = await provider.getChildren();

  assert.deepEqual(
    skills.map((item) => provider.getTreeItem(item)),
    [
      {
        id: "target-skill:global:codex:alpha",
        label: "alpha",
        description: "Codex · managed-copy",
        tooltip: "/global -> /target/alpha",
        iconPath: { id: "agent-codex" },
        contextValue: "sponzeyAppliedSkill",
        collapsibleState: 0,
        target: {
          id: "global:codex",
          clientType: "codex",
          scope: "global",
          targetPath: "/global",
          workspacePath: undefined,
          targetPattern: undefined,
        },
        appliedSkill: {
          name: "alpha",
          kind: "managed-copy",
          status: undefined,
          targetPath: "/target/alpha",
          sourceId: "alpha",
        },
      },
    ],
  );
});

test("tree provider refresh clears cache and fires change event", async () => {
  let loadCount = 0;
  const fired = [];
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.diagnostics",
    async loadReadModel() {
      loadCount += 1;
      return sampleReadModel();
    },
    eventEmitter: {
      event: "event-token",
      fire(element) {
        fired.push(element);
      },
    },
  });

  await provider.getChildren();
  await provider.refresh();
  await provider.getChildren();

  assert.equal(provider.onDidChangeTreeData, "event-token");
  assert.equal(loadCount, 2);
  assert.deepEqual(fired, [undefined]);
});

test("tree provider setReadModel replaces cache without calling loader again", async () => {
  let loadCount = 0;
  const fired = [];
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.mainRepository",
    async loadReadModel() {
      loadCount += 1;
      return sampleReadModel();
    },
    eventEmitter: {
      event: "event-token",
      fire(element) {
        fired.push(element);
      },
    },
  });

  const initialChildren = await provider.getChildren();
  provider.setReadModel({
    ...sampleReadModel(),
    mainRepositorySkills: [
      {
        name: "beta",
        status: "inactive",
        sourcePath: "/repo/skills/beta",
      },
    ],
  });
  const updatedChildren = await provider.getChildren();

  assert.equal(loadCount, 1);
  assert.deepEqual(
    initialChildren.map((item) => item.label),
    ["alpha"],
  );
  assert.deepEqual(
    updatedChildren.map((item) => item.label),
    ["beta"],
  );
  assert.deepEqual(fired, [undefined]);
});

test("refreshSponzeyTreeDataProviders updates all provider caches", async () => {
  const providers = createSkillsTreeDataProviders({
    async loadReadModel() {
      return sampleReadModel();
    },
  });

  refreshSponzeyTreeDataProviders({
    providers,
    readModel: {
      ...sampleReadModel(),
      diagnostics: [
        {
          code: "updated-diagnostic",
          severity: "warning",
          message: "Updated diagnostic.",
        },
      ],
    },
  });

  const diagnostics = await providers["sponzeySkills.diagnostics"].getChildren();
  const categories =
    await providers["sponzeySkills.diagnostics"].getChildren(diagnostics[0]);
  const diagnosticItems =
    await providers["sponzeySkills.diagnostics"].getChildren(categories[0]);

  assert.deepEqual(
    diagnostics.map((item) => item.label),
    ["warning"],
  );
  assert.deepEqual(
    categories.map((item) => item.label),
    ["uncategorized"],
  );
  assert.deepEqual(
    diagnosticItems.map((item) => item.label),
    ["updated-diagnostic"],
  );
});

test("diagnostics tree provider preserves action payload and legacy context value", async () => {
  const provider = createSkillsTreeDataProvider({
    viewId: "sponzeySkills.diagnostics",
    async loadReadModel() {
      return {
        ...sampleReadModel(),
        mainRepositorySkills: [
          {
            id: "alpha",
            name: "alpha",
            status: "inactive",
            sourcePath: "/repo/skills/alpha",
          },
        ],
        diagnostics: [
          {
            code: "missing-description",
            severity: "warning",
            category: "quality",
            message: "Skill description is missing.",
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
                code: "apply-skill-to-target",
                sideEffect: "target-write",
                mutatesTarget: true,
                requiresConfirmation: true,
                safety: "confirmation-required",
              },
            ],
            blockedActions: [],
          },
        ],
      };
    },
  });

  const severityGroups = await provider.getChildren();
  const categoryGroups = await provider.getChildren(severityGroups[0]);
  const diagnosticItems = await provider.getChildren(categoryGroups[0]);
  const diagnosticItem = diagnosticItems[0];

  assert.deepEqual(diagnosticItem.diagnosticActions, {
    allowedActionCodes: ["open-skill-md", "apply-skill-to-target"],
    blockedActionCodes: [],
    confirmationRequiredActionCodes: ["apply-skill-to-target"],
    hasBlockedActions: false,
    hasMutatingAllowedActions: true,
  });
  assert.deepEqual(provider.getTreeItem(diagnosticItem), {
    id: "diagnostic:warning:quality:missing-description:0",
    label: "missing-description",
    description: "alpha · warning",
    tooltip: "Skill description is missing.",
    iconPath: { id: "warning" },
    contextValue: "sponzeyDiagnosticWithSource",
    collapsibleState: 0,
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
  });
});

test("registerSponzeyTreeDataProviders registers every contributed view", () => {
  const registered = [];
  const providers = createSkillsTreeDataProviders({
    async loadReadModel() {
      return sampleReadModel();
    },
  });

  const disposables = registerSponzeyTreeDataProviders({
    windowApi: {
      registerTreeDataProvider(viewId, provider) {
        registered.push([viewId, provider]);
        return { dispose() {} };
      },
    },
    providers,
  });

  assert.deepEqual(
    registered.map(([viewId]) => viewId),
    SPONZEY_TREE_VIEWS.map((view) => view.id),
  );
  assert.equal(
    registered.every(([, provider]) => typeof provider.getChildren === "function"),
    true,
  );
  assert.equal(disposables.length, SPONZEY_TREE_VIEWS.length);
});

function sampleReadModel() {
  return {
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
            kind: "managed-copy",
            targetPath: "/target/alpha",
            sourceId: "alpha",
          },
        ],
      },
    ],
    projectSkills: [],
    diagnostics: [
      {
        code: "broken-symlink",
        severity: "warning",
        message: "Target skill symlink cannot be resolved.",
      },
    ],
  };
}
