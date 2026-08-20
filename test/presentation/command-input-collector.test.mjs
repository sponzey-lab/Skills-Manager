import test from "node:test";
import assert from "node:assert/strict";

import {
  collectCommandInput,
  wrapCommandHandlersWithInputCollection,
} from "../../src/presentation/command-input-collector.js";

test("collectCommandInput prompts missing create skill name and description", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.createSkill",
    input: {},
    window: fakeInputWindow({
      calls,
      responses: ["helper", "Use this skill when writing helper code."],
    }),
  });

  assert.deepEqual(
    calls.map((call) => call.prompt),
    ["Skill name", "Skill description"],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      name: "helper",
      description: "Use this skill when writing helper code.",
    },
  });
});

test("collectCommandInput preserves existing create skill DTO without prompting", async () => {
  const calls = [];
  const input = {
    name: "existing",
    description: "Use this skill when existing input is passed.",
    body: "Body",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.createSkill",
    input,
    window: fakeInputWindow({ calls, responses: [] }),
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    ok: true,
    input,
  });
});

test("wrapCommandHandlersWithInputCollection does not call handler after cancelled input", async () => {
  let handlerCalled = false;
  const handlers = wrapCommandHandlersWithInputCollection({
    handlers: {
      async ["sponzeySkills.createSkill"]() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    window: fakeInputWindow({ calls: [], responses: [undefined] }),
  });

  const result = await handlers["sponzeySkills.createSkill"]();

  assert.equal(handlerCalled, false);
  assert.deepEqual(result, {
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
        commandId: "sponzeySkills.createSkill",
      },
    ],
  });
});

test("collectCommandInput prompts missing import skill folder, name, and analysis option", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.importSkill",
    input: {},
    window: fakeImportWindow({
      calls,
      openDialogResponses: [[{ fsPath: "/external/review-helper" }]],
      inputResponses: ["review-helper"],
      quickPickResponses: [{ label: "Run analysis", value: true }],
    }),
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["openDialog", "inputBox", "quickPick"],
  );
  assert.equal(calls[1].options.value, "review-helper");
  assert.deepEqual(result, {
    ok: true,
    input: {
      externalSourcePath: "/external/review-helper",
      name: "review-helper",
      runAnalysisAfterImport: true,
    },
  });
});

test("collectCommandInput preserves existing import skill DTO without prompting", async () => {
  const calls = [];
  const input = {
    externalSourcePath: "/external/existing",
    name: "existing",
    runAnalysisAfterImport: false,
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.importSkill",
    input,
    window: fakeImportWindow({
      calls,
      openDialogResponses: [],
      inputResponses: [],
      quickPickResponses: [],
    }),
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    ok: true,
    input,
  });
});

test("collectCommandInput enables recursive install for a GitHub folder URL", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.installSkill",
    input: {},
    window: fakeImportWindow({
      calls,
      openDialogResponses: [],
      inputResponses: [
        "https://github.com/acme/skills/tree/main/catalog",
      ],
      quickPickResponses: [{ label: "Run analysis", value: true }],
    }),
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["inputBox", "quickPick"],
  );
  assert.equal(calls[0].options.prompt, "GitHub URL or local skill folder path");
  assert.deepEqual(result, {
    ok: true,
    input: {
      sourceReference: "https://github.com/acme/skills/tree/main/catalog",
      installAllDiscoveredSkills: true,
      runAnalysisAfterInstall: true,
    },
  });
});

test("collectCommandInput keeps custom naming for a local install folder", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.installSkill",
    input: {},
    window: fakeImportWindow({
      calls,
      openDialogResponses: [],
      inputResponses: ["/external/review", "custom-review"],
      quickPickResponses: [{ label: "Skip analysis", value: false }],
    }),
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["inputBox", "inputBox", "quickPick"],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      sourceReference: "/external/review",
      name: "custom-review",
      runAnalysisAfterInstall: false,
    },
  });
});

test("collectCommandInput preserves existing install skill DTO without prompting", async () => {
  const calls = [];
  const input = {
    sourceReference: "/external/review",
    name: "review",
    runAnalysisAfterInstall: false,
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.installSkill",
    input,
    window: fakeImportWindow({
      calls,
      openDialogResponses: [],
      inputResponses: [],
      quickPickResponses: [],
    }),
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    ok: true,
    input,
  });
});

test("collectCommandInput prompts set main repository with repository label", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.setMainRepository",
    input: {},
    window: fakeImportWindow({
      calls,
      openDialogResponses: [[{ fsPath: "/main/repository" }]],
      inputResponses: [],
      quickPickResponses: [],
    }),
  });

  assert.deepEqual(calls.map((call) => call.kind), ["openDialog"]);
  assert.equal(calls[0].options.openLabel, "Select Main Repository");
  assert.deepEqual(result, {
    ok: true,
    input: {
      mainRepositoryPath: "/main/repository",
    },
  });
});

test("collectCommandInput prompts add global repository client", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.addGlobalRepository",
    input: {},
    defaultGlobalTargets: [
      {
        clientType: "codex",
        targetPath: "/home/test/.agents/skills",
      },
      {
        clientType: "claude",
        targetPath: "/home/test/.claude/skills",
      },
    ],
    window: fakeImportWindow({
      calls,
      openDialogResponses: [],
      inputResponses: [],
      quickPickResponses: [{ label: "codex", value: "codex" }],
    }),
  });

  assert.deepEqual(calls.map((call) => call.kind), ["quickPick"]);
  assert.equal(calls[0].options.placeHolder, "Select global repository client");
  assert.deepEqual(result, {
    ok: true,
    input: {
      targetPath: "/home/test/.agents/skills",
      clientType: "codex",
    },
  });
});

test("collectCommandInput supports all global repository clients", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.addGlobalRepository",
    input: {},
    defaultGlobalTargets: [
      {
        clientType: "codex",
        targetPath: "/home/test/.agents/skills",
      },
      {
        clientType: "claude",
        targetPath: "/home/test/.claude/skills",
      },
    ],
    window: fakeImportWindow({
      calls,
      openDialogResponses: [],
      inputResponses: [],
      quickPickResponses: [{ label: "all", value: "all" }],
    }),
  });

  assert.deepEqual(calls.map((call) => call.kind), ["quickPick"]);
  assert.deepEqual(result, {
    ok: true,
    input: {
      targets: [
        {
          targetPath: "/home/test/.agents/skills",
          clientType: "codex",
        },
        {
          targetPath: "/home/test/.claude/skills",
          clientType: "claude",
        },
      ],
    },
  });
});

test("collectCommandInput prompts remove global repository target", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.removeGlobalRepository",
    input: {},
    window: fakeImportWindow({
      calls,
      openDialogResponses: [],
      inputResponses: [],
      quickPickResponses: [
        {
          label: "global:codex:/global/codex",
          value: {
            targetId: "global:codex:/global/codex",
          },
        },
        {
          label: "Unregister global repository (keep skills on disk)",
          value: true,
        },
      ],
    }),
    async loadReadModel() {
      return {
        globalSkills: [
          {
            targetId: "global:codex:/global/codex",
            clientType: "codex",
            scope: "global",
            targetPath: "/global/codex",
            skills: [],
          },
        ],
      };
    },
  });

  assert.deepEqual(calls.map((call) => call.kind), ["quickPick", "quickPick"]);
  assert.deepEqual(result, {
    ok: true,
    input: {
      targetId: "global:codex:/global/codex",
      confirmationProvided: true,
    },
  });
});

test("collectCommandInput prompts add and remove project repository patterns", async () => {
  const addCalls = [];
  const addResult = await collectCommandInput({
    commandId: "sponzeySkills.addProjectRepository",
    input: {},
    window: fakeImportWindow({
      calls: addCalls,
      openDialogResponses: [],
      inputResponses: [],
      quickPickResponses: [{ label: "all", value: "all" }],
    }),
  });
  const removeCalls = [];
  const removeResult = await collectCommandInput({
    commandId: "sponzeySkills.removeProjectRepository",
    input: {},
    window: fakeImportWindow({
      calls: removeCalls,
      openDialogResponses: [],
      inputResponses: [],
      quickPickResponses: [
        {
          label: ".agents/skills",
          description: "codex",
          value: {
            targetPattern: ".agents/skills",
          },
        },
        {
          label: "Unregister project repository (keep skills on disk)",
          value: true,
        },
      ],
    }),
    async loadReadModel() {
      return {
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
      };
    },
  });

  assert.equal(addCalls[0].options.placeHolder, "Select project repository client");
  assert.deepEqual(addResult, {
    ok: true,
    input: {
      targetPatterns: [".agents/skills", ".claude/skills"],
    },
  });
  assert.deepEqual(removeCalls.map((call) => call.kind), [
    "quickPick",
    "quickPick",
  ]);
  assert.deepEqual(removeCalls[0].items, [
    {
      label: ".agents/skills",
      description: "codex",
      value: {
        targetPattern: ".agents/skills",
      },
    },
  ]);
  assert.deepEqual(removeResult, {
    ok: true,
    input: {
      targetPattern: ".agents/skills",
      confirmationProvided: true,
    },
  });
});

test("collectCommandInput displays project targets without absolute project path", async () => {
  const calls = [];
  const projectTarget = {
    id: "project:/workspace:.agents/skills",
    clientType: "codex",
    scope: "project",
    targetPath: "/workspace/.agents/skills",
    workspacePath: undefined,
    targetPattern: ".agents/skills",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToProjectTarget",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "alpha",
          value: {
            id: "alpha",
            name: "alpha",
            sourcePath: "/repo/skills/alpha",
          },
        },
        {
          label: "codex project",
          description: ".agents/skills",
          value: projectTarget,
        },
        {
          label: "copy",
          value: "copy",
        },
      ],
    }),
    async loadReadModel() {
      return {
        ...applyReadModel(),
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
      };
    },
  });

  assert.deepEqual(calls[1].items, [
    {
      label: "codex project",
      description: ".agents/skills",
      value: projectTarget,
    },
  ]);
  assert.deepEqual(result, {
    ok: true,
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
      target: projectTarget,
      applyMode: "copy",
    },
  });
});

test("wrapCommandHandlersWithInputCollection does not call import handler after folder cancel", async () => {
  let handlerCalled = false;
  const handlers = wrapCommandHandlersWithInputCollection({
    handlers: {
      async ["sponzeySkills.importSkill"]() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    window: fakeImportWindow({
      calls: [],
      openDialogResponses: [undefined],
      inputResponses: [],
      quickPickResponses: [],
    }),
  });

  const result = await handlers["sponzeySkills.importSkill"]();

  assert.equal(handlerCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.diagnostics[0].code, "command-input-cancelled");
});

test("collectCommandInput prompts missing global apply source and mode", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "alpha",
          value: {
            id: "alpha",
            name: "alpha",
            sourcePath: "/repo/skills/alpha",
          },
        },
        {
          label: "copy",
          value: "copy",
        },
      ],
    }),
    async loadReadModel() {
      return applyReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.options.placeHolder),
    ["Select source skill", "Select apply mode"],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
      target: globalTarget(),
      applyMode: "copy",
    },
  });
});

test("collectCommandInput uses an internal Global trigger target without asking the user to select one", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input: {},
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [
        { label: "alpha", value: { id: "alpha", name: "alpha", sourcePath: "/repo/alpha" } },
        { label: "copy", value: "copy" },
      ],
    }),
    async loadReadModel() { return applyReadModel(); },
  });

  assert.deepEqual(calls.map((call) => call.options.placeHolder), [
    "Select source skill",
    "Select apply mode",
  ]);
  assert.equal(result.input.target.id, "global:codex");
});

test("collectCommandInput annotates apply targets with explicit compatibility", async () => {
  const calls = [];
  const sourceWithCompatibility = {
    id: "alpha",
    name: "alpha",
    sourcePath: "/repo/skills/alpha",
    compatibility: {
      codex: "compatible",
      claude: "unknown",
    },
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "alpha",
          value: sourceWithCompatibility,
        },
        {
          label: "copy",
          value: "copy",
        },
      ],
    }),
    async loadReadModel() {
      return {
        ...applyReadModel(),
        mainRepositorySkills: [sourceWithCompatibility],
        globalSkills: [
          {
            targetId: "global:codex",
            clientType: "codex",
            scope: "global",
            targetPath: "/global-codex",
            skills: [],
          },
          {
            targetId: "global:claude",
            clientType: "claude",
            scope: "global",
            targetPath: "/global-claude",
            skills: [],
          },
        ],
      };
    },
  });

  assert.equal(result.input.target.id, "global:codex");
  assert.equal(result.ok, true);
});

test("collectCommandInput excludes discovery-only compatibility targets from apply choices", async () => {
  const calls = [];
  const standardGroup = {
    ...applyReadModel().globalSkills[0],
    origin: "standard",
    capabilities: {
      discoverable: true,
      applyable: true,
    },
  };
  const compatibilityGroup = {
    targetId: "compatibility:codex",
    clientType: "codex",
    scope: "global",
    targetPath: "/home/test/.codex/skills",
    origin: "compatibility",
    capabilities: {
      discoverable: true,
      applyable: false,
      removable: false,
      movable: false,
      copyable: true,
      backupable: true,
    },
    skills: [],
  };

  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "alpha",
          value: applyReadModel().mainRepositorySkills[0],
        },
        { label: "copy", value: "copy" },
      ],
    }),
    async loadReadModel() {
      return {
        ...applyReadModel(),
        globalSkills: [standardGroup, compatibilityGroup],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.input.target.id, "global:codex");
});

test("collectCommandInput annotates apply targets from compatibility diagnostics and custom clients", async () => {
  const calls = [];
  const codexOnlySource = {
    id: "alpha",
    name: "alpha",
    sourcePath: "/repo/skills/alpha",
    diagnostics: [
      {
        code: "codex-only-compatibility",
        severity: "warning",
        category: "compatibility",
        message: "Skill appears to require Codex-specific behavior.",
      },
    ],
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "alpha",
          value: codexOnlySource,
        },
        {
          label: "symlink",
          value: "symlink",
        },
      ],
    }),
    async loadReadModel() {
      return {
        ...applyReadModel(),
        mainRepositorySkills: [codexOnlySource],
        globalSkills: [
          {
            targetId: "global:codex",
            clientType: "codex",
            scope: "global",
            targetPath: "/global-codex",
            skills: [],
          },
          {
            targetId: "global:claude",
            clientType: "claude",
            scope: "global",
            targetPath: "/global-claude",
            skills: [],
          },
          {
            targetId: "global:custom",
            clientType: "custom",
            scope: "global",
            targetPath: "/global-custom",
            skills: [],
          },
        ],
      };
    },
  });

  assert.equal(result.input.target.id, "global:codex");
  assert.equal(result.ok, true);
});

test("collectCommandInput preserves existing apply DTO without loading read model", async () => {
  const calls = [];
  let loadCalled = false;
  const input = {
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
    },
    target: globalTarget(),
    applyMode: "symlink",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input,
    window: fakeQuickPickWindow({ calls, responses: [] }),
    async loadReadModel() {
      loadCalled = true;
      return applyReadModel();
    },
  });

  assert.equal(loadCalled, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    ok: true,
    input,
  });
});

test("collectCommandInput keeps the source selected from a tree item", async () => {
  const calls = [];
  const selectedSource = {
    id: "beta",
    name: "beta",
    sourcePath: "/repo/skills/beta",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input: { source: selectedSource },
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "copy",
          value: "copy",
        },
      ],
    }),
    async loadReadModel() {
      return applyReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.options.placeHolder),
    ["Select apply mode"],
  );
  assert.equal(result.ok, true);
  assert.equal(result.input.source, selectedSource);
  assert.equal(result.input.source.name, "beta");
});

test("wrapCommandHandlersWithInputCollection does not call apply handler after source cancel", async () => {
  let handlerCalled = false;
  const handlers = wrapCommandHandlersWithInputCollection({
    handlers: {
      async ["sponzeySkills.applySkillToGlobalTarget"]() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    window: fakeQuickPickWindow({ calls: [], responses: [undefined] }),
    async loadReadModel() {
      return applyReadModel();
    },
  });

  const result = await handlers["sponzeySkills.applySkillToGlobalTarget"]();

  assert.equal(handlerCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.diagnostics[0].code, "command-input-cancelled");
});

test("collectCommandInput returns unavailable when apply source choices are empty", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.applySkillToGlobalTarget",
    input: {},
    window: fakeQuickPickWindow({ calls, responses: [] }),
    async loadReadModel() {
      return {
        ...applyReadModel(),
        mainRepositorySkills: [],
      };
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(result.ok, false);
  assert.equal(result.result.ok, false);
  assert.equal(result.result.diagnostics[0].code, "command-input-unavailable");
  assert.equal(result.result.events[0].code, "command.input.unavailable");
});

test("collectCommandInput prompts missing remove target and applied skill", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.removeAppliedSkill",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "global:codex",
          value: {
            target: globalTarget(),
            group: removeReadModel().globalSkills[0],
          },
        },
        {
          label: "alpha",
          value: {
            name: "alpha",
            kind: "managed-copy",
            status: "managed",
            targetPath: "/global/alpha",
            sourceId: "alpha",
          },
        },
      ],
    }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.options.placeHolder),
    [
      "Select target to remove skill from",
      "Select applied target skill to remove",
    ],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      target: globalTarget(),
      appliedSkill: {
        name: "alpha",
        kind: "managed-copy",
        status: "managed",
        targetPath: "/global/alpha",
        sourceId: "alpha",
      },
    },
  });
});

test("collectCommandInput excludes compatibility targets from remove choices", async () => {
  const calls = [];
  const standardGroup = {
    ...removeReadModel().globalSkills[0],
    origin: "standard",
    capabilities: { removable: true },
  };
  const compatibilityGroup = {
    ...standardGroup,
    targetId: "compatibility:codex",
    targetPath: "/home/test/.codex/skills",
    origin: "compatibility",
    capabilities: { removable: false },
  };

  const result = await collectCommandInput({
    commandId: "sponzeySkills.removeAppliedSkill",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "global:codex",
          value: {
            target: globalTarget(),
            group: standardGroup,
          },
        },
        {
          label: "alpha",
          value: appliedAlphaSkill(),
        },
      ],
    }),
    async loadReadModel() {
      return {
        ...removeReadModel(),
        globalSkills: [standardGroup, compatibilityGroup],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    calls[0].items.map((item) => item.label),
    ["global:codex", "codex project"],
  );
});

test("collectCommandInput preserves existing remove DTO without loading read model", async () => {
  const calls = [];
  let loadCalled = false;
  const input = {
    target: globalTarget(),
    appliedSkill: {
      name: "alpha",
      kind: "managed-copy",
      targetPath: "/global/alpha",
      sourceId: "alpha",
    },
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.removeAppliedSkill",
    input,
    window: fakeQuickPickWindow({ calls, responses: [] }),
    async loadReadModel() {
      loadCalled = true;
      return removeReadModel();
    },
  });

  assert.equal(loadCalled, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    ok: true,
    input,
  });
});

test("wrapCommandHandlersWithInputCollection does not call remove handler after target cancel", async () => {
  let handlerCalled = false;
  const handlers = wrapCommandHandlersWithInputCollection({
    handlers: {
      async ["sponzeySkills.removeAppliedSkill"]() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    window: fakeQuickPickWindow({ calls: [], responses: [undefined] }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  const result = await handlers["sponzeySkills.removeAppliedSkill"]();

  assert.equal(handlerCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.diagnostics[0].code, "command-input-cancelled");
});

test("collectCommandInput returns unavailable when selected target has no applied skills", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.removeAppliedSkill",
    input: {
      target: globalTarget(),
    },
    window: fakeQuickPickWindow({ calls, responses: [] }),
    async loadReadModel() {
      return applyReadModel();
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(result.ok, false);
  assert.equal(result.result.ok, false);
  assert.equal(result.result.diagnostics[0].code, "command-input-unavailable");
  assert.equal(result.result.events[0].commandId, "sponzeySkills.removeAppliedSkill");
});

test("collectCommandInput prompts missing copy transfer target, applied skill, and source name", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.copyAppliedSkillToMainRepository",
    input: {},
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [
        {
          label: "global:codex",
          value: {
            target: globalTarget(),
            group: removeReadModel().globalSkills[0],
          },
        },
        {
          label: "alpha",
          value: appliedAlphaSkill(),
        },
      ],
      inputResponses: ["alpha-copy"],
    }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["quickPick", "quickPick", "inputBox"],
  );
  assert.deepEqual(
    calls.map((call) => call.options.placeHolder ?? call.options.prompt),
    [
      "Select target to copy skill from",
      "Select applied target skill to copy",
      "Source skill name",
    ],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      target: globalTarget(),
      appliedSkill: appliedAlphaSkill(),
      sourceName: "alpha-copy",
    },
  });
});

test("collectCommandInput prompts missing backup transfer target, applied skill, and snapshot ID", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.backupAppliedSkillToMainRepository",
    input: {},
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [
        {
          label: "global:codex",
          value: {
            target: globalTarget(),
            group: removeReadModel().globalSkills[0],
          },
        },
        {
          label: "alpha",
          value: appliedAlphaSkill(),
        },
      ],
      inputResponses: ["snapshot-001"],
    }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["quickPick", "quickPick", "inputBox"],
  );
  assert.deepEqual(
    calls.map((call) => call.options.placeHolder ?? call.options.prompt),
    [
      "Select target to back up skill from",
      "Select applied target skill to back up",
      "Backup snapshot ID",
    ],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      target: globalTarget(),
      appliedSkill: appliedAlphaSkill(),
      snapshotId: "snapshot-001",
    },
  });
});

test("collectCommandInput prompts missing move transfer target, applied skill, source name, and cleanup confirmation", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.moveAppliedSkillToMainRepository",
    input: {},
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [
        {
          label: "global:codex",
          value: {
            target: globalTarget(),
            group: removeReadModel().globalSkills[0],
          },
        },
        {
          label: "alpha",
          value: appliedAlphaSkill(),
        },
        {
          label: "Remove target entry after copy",
          value: true,
        },
      ],
      inputResponses: ["alpha-moved"],
    }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["quickPick", "quickPick", "inputBox", "quickPick"],
  );
  assert.deepEqual(
    calls.map((call) => call.options.placeHolder ?? call.options.prompt),
    [
      "Select target to move skill from",
      "Select applied target skill to move",
      "Source skill name",
      "Remove original target entry after copy?",
    ],
  );
  assert.deepEqual(calls[3].items, [
    { label: "Remove target entry after copy", value: true },
    { label: "Keep target entry", value: false },
  ]);
  assert.deepEqual(result, {
    ok: true,
    input: {
      target: globalTarget(),
      appliedSkill: appliedAlphaSkill(),
      sourceName: "alpha-moved",
      cleanupConfirmed: true,
    },
  });
});

test("collectCommandInput preserves existing move transfer DTO without loading read model", async () => {
  const calls = [];
  let loadCalled = false;
  const input = {
    target: globalTarget(),
    appliedSkill: appliedAlphaSkill(),
    sourceName: "alpha-moved",
    cleanupConfirmed: true,
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.moveAppliedSkillToMainRepository",
    input,
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [],
      inputResponses: [],
    }),
    async loadReadModel() {
      loadCalled = true;
      return removeReadModel();
    },
  });

  assert.equal(loadCalled, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    ok: true,
    input,
  });
});

test("wrapCommandHandlersWithInputCollection does not call transfer handler after source name cancel", async () => {
  let handlerCalled = false;
  const handlers = wrapCommandHandlersWithInputCollection({
    handlers: {
      async ["sponzeySkills.copyAppliedSkillToMainRepository"]() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    window: fakeTransferWindow({
      calls: [],
      quickPickResponses: [
        {
          label: "global:codex",
          value: {
            target: globalTarget(),
            group: removeReadModel().globalSkills[0],
          },
        },
        {
          label: "alpha",
          value: appliedAlphaSkill(),
        },
      ],
      inputResponses: [undefined],
    }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  const result =
    await handlers["sponzeySkills.copyAppliedSkillToMainRepository"]();

  assert.equal(handlerCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.diagnostics[0].code, "command-input-cancelled");
});

test("wrapCommandHandlersWithInputCollection does not call transfer handler when target choices are empty", async () => {
  let handlerCalled = false;
  const handlers = wrapCommandHandlersWithInputCollection({
    handlers: {
      async ["sponzeySkills.copyAppliedSkillToMainRepository"]() {
        handlerCalled = true;
        return { ok: true };
      },
    },
    window: fakeTransferWindow({
      calls: [],
      quickPickResponses: [],
      inputResponses: [],
    }),
    async loadReadModel() {
      return {
        ...applyReadModel(),
        globalSkills: [],
        projectSkills: [],
      };
    },
  });

  const result =
    await handlers["sponzeySkills.copyAppliedSkillToMainRepository"]();

  assert.equal(handlerCalled, false);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "command-input-unavailable");
  assert.equal(result.events[0].commandId, "sponzeySkills.copyAppliedSkillToMainRepository");
});

test("collectCommandInput uses applied skill tree item payload without target prompts", async () => {
  const calls = [];
  let loadCalled = false;
  const result = await collectCommandInput({
    commandId: "sponzeySkills.copyAppliedSkillToMainRepository",
    input: {
      contextValue: "sponzeyAppliedSkill",
      target: globalTarget(),
      appliedSkill: appliedAlphaSkill(),
    },
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [],
      inputResponses: ["alpha-copy"],
    }),
    async loadReadModel() {
      loadCalled = true;
      return removeReadModel();
    },
  });

  assert.equal(loadCalled, false);
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["inputBox"],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      contextValue: "sponzeyAppliedSkill",
      target: globalTarget(),
      appliedSkill: appliedAlphaSkill(),
      sourceName: "alpha-copy",
    },
  });
});

test("collectCommandInput prompts source selection for open SKILL.md", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.openSkillMd",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "alpha",
          value: {
            id: "alpha",
            name: "alpha",
            sourcePath: "/repo/skills/alpha",
          },
        },
      ],
    }),
    async loadReadModel() {
      return applyReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.options.placeHolder),
    ["Select source skill"],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      openKind: "skillMd",
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
    },
  });
});

test("collectCommandInput prompts detail target for source or applied skill", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.showSkillDetail",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "alpha",
          value: {
            source: {
              id: "alpha",
              name: "alpha",
              sourcePath: "/repo/skills/alpha",
            },
          },
        },
      ],
    }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  assert.equal(calls[0].options.placeHolder, "Select skill to inspect");
  assert.deepEqual(result, {
    ok: true,
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
    },
  });
});

test("collectCommandInput preserves backup detail input without prompting", async () => {
  const result = await collectCommandInput({
    commandId: "sponzeySkills.showSkillDetail",
    input: {
      backup: {
        skillName: "alpha",
        snapshotId: "snapshot-001",
        backupPath: "/repo/backups/alpha/snapshot-001",
      },
    },
    window: fakeQuickPickWindow({
      calls: [],
      responses: [],
    }),
    async loadReadModel() {
      throw new Error("backup payload should not load read model");
    },
  });

  assert.deepEqual(result, {
    ok: true,
    input: {
      backup: {
        skillName: "alpha",
        snapshotId: "snapshot-001",
        backupPath: "/repo/backups/alpha/snapshot-001",
      },
    },
  });
});

test("collectCommandInput includes backups in detail target choices", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.showSkillDetail",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "Backup alpha:snapshot-001",
          value: {
            backup: {
              skillName: "alpha",
              snapshotId: "snapshot-001",
              backupPath: "/repo/backups/alpha/snapshot-001",
            },
          },
        },
      ],
    }),
    async loadReadModel() {
      return {
        ...removeReadModel(),
        backups: [
          {
            skillName: "alpha",
            snapshotId: "snapshot-001",
            backupPath: "/repo/backups/alpha/snapshot-001",
          },
        ],
      };
    },
  });

  assert.equal(calls[0].options.placeHolder, "Select skill to inspect");
  assert.equal(
    calls[0].items.some((item) => item.label === "Backup alpha:snapshot-001"),
    true,
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      backup: {
        skillName: "alpha",
        snapshotId: "snapshot-001",
        backupPath: "/repo/backups/alpha/snapshot-001",
      },
    },
  });
});

test("collectCommandInput preserves diagnostic detail input without prompting", async () => {
  const diagnostic = {
    code: "external-dependencies-detected",
    severity: "warning",
    category: "dependency",
    message: "Skill declares external dependencies.",
    recommendation: "Review dependency installation steps before applying.",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.showSkillDetail",
    input: { diagnostic },
    window: fakeQuickPickWindow({
      calls: [],
      responses: [],
    }),
    async loadReadModel() {
      throw new Error("diagnostic payload should not load read model");
    },
  });

  assert.deepEqual(result, {
    ok: true,
    input: { diagnostic },
  });
});

test("collectCommandInput includes diagnostics in detail target choices", async () => {
  const calls = [];
  const diagnostic = {
    code: "external-dependencies-detected",
    severity: "warning",
    category: "dependency",
    message: "Skill declares external dependencies.",
    recommendation: "Review dependency installation steps before applying.",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.showSkillDetail",
    input: {},
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "external-dependencies-detected",
          value: { diagnostic },
        },
      ],
    }),
    async loadReadModel() {
      return {
        ...removeReadModel(),
        diagnostics: [diagnostic],
      };
    },
  });

  assert.equal(calls[0].options.placeHolder, "Select skill to inspect");
  assert.deepEqual(
    calls[0].items.find(
      (item) => item.label === "external-dependencies-detected",
    ),
    {
      label: "external-dependencies-detected",
      description: "warning",
      detail: "Skill declares external dependencies.",
      value: { diagnostic },
    },
  );
  assert.deepEqual(result, {
    ok: true,
    input: { diagnostic },
  });
});

test("collectCommandInput prompts supported diagnostic remediation actions only", async () => {
  const calls = [];
  const diagnostic = {
    code: "external-dependencies-detected",
    severity: "warning",
    category: "dependency",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.runDiagnosticAction",
    input: {
      diagnostic,
      diagnosticActions: {
        allowedActionCodes: [
          "open-skill-md",
          "analyze-again",
          "apply-skill-to-target",
          "compare-backup",
        ],
        blockedActionCodes: [],
        confirmationRequiredActionCodes: ["apply-skill-to-target"],
      },
    },
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "Analyze Again",
          value: "analyze-again",
        },
      ],
    }),
  });

  assert.equal(calls[0].options.placeHolder, "Select diagnostic action");
  assert.deepEqual(
    calls[0].items.map((item) => [item.label, item.value]),
    [
      ["Open SKILL.md", "open-skill-md"],
      ["Analyze Again", "analyze-again"],
      ["Compare Backup", "compare-backup"],
      ["Apply Skill to Target", "apply-skill-to-target"],
    ],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      diagnostic,
      diagnosticActions: {
        allowedActionCodes: [
          "open-skill-md",
          "analyze-again",
          "apply-skill-to-target",
          "compare-backup",
        ],
        blockedActionCodes: [],
        confirmationRequiredActionCodes: ["apply-skill-to-target"],
      },
      actionCode: "analyze-again",
    },
  });
});

test("collectCommandInput requires explicit confirmation for mutating diagnostic remediation", async () => {
  const calls = [];
  const input = {
    diagnosticActions: {
      allowedActionCodes: ["apply-skill-to-target"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: ["apply-skill-to-target"],
    },
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.runDiagnosticAction",
    input,
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "Apply Skill to Target",
          value: "apply-skill-to-target",
        },
        {
          label: "Confirm Apply",
          value: true,
        },
      ],
    }),
  });

  assert.equal(calls[0].options.placeHolder, "Select diagnostic action");
  assert.equal(calls[1].options.placeHolder, "Confirm diagnostic action");
  assert.deepEqual(result, {
    ok: true,
    input: {
      ...input,
      actionCode: "apply-skill-to-target",
      confirmationProvided: true,
    },
  });
});

test("collectCommandInput prompts delete-backup diagnostic remediation confirmation", async () => {
  const calls = [];
  const input = {
    diagnosticActions: {
      allowedActionCodes: ["delete-backup"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: ["delete-backup"],
    },
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.runDiagnosticAction",
    input,
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "Delete Backup",
          value: "delete-backup",
        },
        {
          label: "Confirm Delete Backup",
          value: true,
        },
      ],
    }),
  });

  assert.equal(calls[0].options.placeHolder, "Select diagnostic action");
  assert.deepEqual(
    calls[0].items.map((item) => item.label),
    ["Delete Backup"],
  );
  assert.equal(calls[1].options.placeHolder, "Confirm diagnostic action");
  assert.deepEqual(calls[1].items[0], {
    label: "Confirm Delete Backup",
    description: "Delete this backup snapshot.",
    value: true,
  });
  assert.deepEqual(result, {
    ok: true,
    input: {
      ...input,
      actionCode: "delete-backup",
      confirmationProvided: true,
    },
  });
});

test("collectCommandInput cancels mutating diagnostic remediation without confirmation", async () => {
  const result = await collectCommandInput({
    commandId: "sponzeySkills.runDiagnosticAction",
    input: {
      actionCode: "apply-skill-to-target",
      diagnosticActions: {
        allowedActionCodes: ["apply-skill-to-target"],
        blockedActionCodes: [],
        confirmationRequiredActionCodes: ["apply-skill-to-target"],
      },
    },
    window: fakeQuickPickWindow({
      calls: [],
      responses: [undefined],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.result.cancelled, true);
});

test("collectCommandInput preserves existing diagnostic action code without prompting", async () => {
  const calls = [];
  const input = {
    actionCode: "open-skill-md",
    diagnosticActions: {
      allowedActionCodes: ["open-skill-md"],
      blockedActionCodes: [],
      confirmationRequiredActionCodes: [],
    },
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.runDiagnosticAction",
    input,
    window: fakeQuickPickWindow({
      calls,
      responses: [],
    }),
  });

  assert.deepEqual(calls, []);
  assert.deepEqual(result, {
    ok: true,
    input,
  });
});

test("collectCommandInput returns unavailable when diagnostic has no supported actions", async () => {
  const result = await collectCommandInput({
    commandId: "sponzeySkills.runDiagnosticAction",
    input: {
      diagnosticActions: {
        allowedActionCodes: ["delete-source-skill"],
        blockedActionCodes: [],
        confirmationRequiredActionCodes: [],
      },
    },
    window: fakeQuickPickWindow({
      calls: [],
      responses: [],
    }),
  });

  assert.deepEqual(result, {
    ok: false,
    result: {
      ok: false,
      diagnostics: [
        {
          code: "command-input-unavailable",
          severity: "error",
          message: "No supported diagnostic actions are available.",
        },
      ],
      events: [
        {
          level: "ProductLog",
          code: "command.input.unavailable",
          commandId: "sponzeySkills.runDiagnosticAction",
        },
      ],
    },
  });
});

test("collectCommandInput prompts backup compare reference folder", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.compareSkillBackup",
    input: {
      backup: {
        skillName: "alpha",
        snapshotId: "snapshot-001",
        backupPath: "/repo/backups/alpha/snapshot-001",
      },
    },
    window: fakeImportWindow({
      calls,
      openDialogResponses: [[{ fsPath: "/repo/skills/alpha" }]],
      inputResponses: [],
      quickPickResponses: [],
    }),
  });

  assert.deepEqual(calls.map((call) => call.kind), ["openDialog"]);
  assert.equal(calls[0].options.openLabel, "Select Reference Skill Folder");
  assert.deepEqual(result, {
    ok: true,
    input: {
      backup: {
        skillName: "alpha",
        snapshotId: "snapshot-001",
        backupPath: "/repo/backups/alpha/snapshot-001",
      },
      referencePath: "/repo/skills/alpha",
    },
  });
});

test("collectCommandInput prompts backup restore target and overwrite confirmation", async () => {
  const calls = [];
  const backup = {
    skillName: "alpha",
    snapshotId: "snapshot-001",
    backupPath: "/repo/backups/alpha/snapshot-001",
  };
  const result = await collectCommandInput({
    commandId: "sponzeySkills.restoreBackupToTarget",
    input: { backup },
    window: fakeQuickPickWindow({
      calls,
      responses: [
        {
          label: "global:codex",
          value: {
            target: {
              id: "global:codex",
              clientType: "codex",
              scope: "global",
              targetPath: "/global",
            },
          },
        },
        {
          label: "Restore and overwrite target if needed",
          value: true,
        },
      ],
    }),
    async loadReadModel() {
      return removeReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.options.placeHolder),
    [
      "Select target to restore backup to",
      "Restore backup and overwrite target if it exists?",
    ],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      backup,
      target: {
        id: "global:codex",
        clientType: "codex",
        scope: "global",
        targetPath: "/global",
      },
      overwriteConfirmed: true,
    },
  });
});

test("collectCommandInput prompts update copy selection and confirmation for target changes", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.updateAppliedCopyFromSource",
    input: {},
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [
        {
          label: "global:codex",
          value: {
            target: globalTarget(),
            group: changedCopyReadModel().globalSkills[0],
          },
        },
        {
          label: "alpha",
          value: changedAppliedAlphaSkill(),
        },
        {
          label: "Update and replace target changes",
          value: true,
        },
      ],
      inputResponses: [],
    }),
    async loadReadModel() {
      return changedCopyReadModel();
    },
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["quickPick", "quickPick", "quickPick"],
  );
  assert.deepEqual(result, {
    ok: true,
    input: {
      target: globalTarget(),
      appliedSkill: changedAppliedAlphaSkill(),
      source: {
        id: "alpha",
        name: "alpha",
        status: "inactive",
        sourcePath: "/repo/skills/alpha",
      },
      confirmationProvided: true,
    },
  });
});

test("collectCommandInput prompts source lifecycle rename, delete, and export inputs", async () => {
  const renameCalls = [];
  const renameResult = await collectCommandInput({
    commandId: "sponzeySkills.renameSourceSkill",
    input: {},
    window: fakeTransferWindow({
      calls: renameCalls,
      quickPickResponses: [
        {
          label: "alpha",
          value: {
            id: "alpha",
            name: "alpha",
            sourcePath: "/repo/skills/alpha",
          },
        },
      ],
      inputResponses: ["alpha-renamed"],
    }),
    async loadReadModel() {
      return applyReadModel();
    },
  });

  const deleteCalls = [];
  const deleteResult = await collectCommandInput({
    commandId: "sponzeySkills.deleteSourceSkill",
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
    },
    window: fakeTransferWindow({
      calls: deleteCalls,
      quickPickResponses: [
        {
          label: "Delete source and clean up managed targets",
          value: "cleanup",
        },
        {
          label: "Delete source skill",
          value: true,
        },
      ],
      inputResponses: [],
    }),
  });

  const exportCalls = [];
  const exportResult = await collectCommandInput({
    commandId: "sponzeySkills.exportSourceSkill",
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
      },
    },
    window: fakeTransferWindow({
      calls: exportCalls,
      quickPickResponses: [],
      inputResponses: ["/tmp/alpha.sponzey-skill.json"],
    }),
  });

  assert.deepEqual(renameCalls.map((call) => call.kind), [
    "quickPick",
    "inputBox",
  ]);
  assert.equal(renameResult.input.oldName, "alpha");
  assert.equal(renameResult.input.newName, "alpha-renamed");
  assert.equal(deleteResult.input.skillName, "alpha");
  assert.equal(deleteResult.input.confirmationProvided, true);
  assert.equal(exportResult.input.skillName, "alpha");
  assert.equal(exportResult.input.archivePath, "/tmp/alpha.sponzey-skill.json");
});

test("collectCommandInput prompts source delete impact confirmation for applied source", async () => {
  const calls = [];
  const result = await collectCommandInput({
    commandId: "sponzeySkills.deleteSourceSkill",
    input: {
      source: {
        id: "alpha",
        name: "alpha",
        sourcePath: "/repo/skills/alpha",
        appliedTargetCount: 1,
      },
    },
    window: fakeTransferWindow({
      calls,
      quickPickResponses: [
        {
          label: "Delete source and clean up managed targets",
          value: "cleanup",
        },
        {
          label: "Delete source skill",
          value: true,
        },
      ],
      inputResponses: [],
    }),
  });

  assert.deepEqual(
    calls.map((call) => call.options.placeHolder),
    [
      "Delete source 'alpha'? Managed targets will be checked before deletion.",
      "Delete source skill 'alpha'?",
    ],
  );
  assert.deepEqual(result.input, {
    source: {
      id: "alpha",
      name: "alpha",
      sourcePath: "/repo/skills/alpha",
      appliedTargetCount: 1,
    },
    skillName: "alpha",
    cleanupManagedPlacements: true,
    impactConfirmed: true,
    confirmationProvided: true,
  });
});

test("collectCommandInput confirms Global enrollment removal for a selected source", async () => {
  const result = await collectCommandInput({
    commandId: "sponzeySkills.removeGlobalSkillEnrollment",
    input: { source: { id: "alpha", name: "alpha", sourcePath: "/repo/alpha" } },
    window: fakeTransferWindow({
      calls: [],
      quickPickResponses: [{ label: "Remove Global enrollment and managed Global placements", value: true }],
      inputResponses: [],
    }),
  });

  assert.deepEqual(result, {
    ok: true,
    input: { sourceSkillId: "alpha", confirmationProvided: true },
  });
});

test("collectCommandInput prompts archive import and backup management inputs", async () => {
  const importCalls = [];
  const importResult = await collectCommandInput({
    commandId: "sponzeySkills.importSkillArchive",
    input: {},
    window: fakeImportWindow({
      calls: importCalls,
      openDialogResponses: [[{ fsPath: "/tmp/beta.sponzey-skill.json" }]],
      inputResponses: ["beta"],
      quickPickResponses: [],
    }),
  });

  const promoteCalls = [];
  const promoteResult = await collectCommandInput({
    commandId: "sponzeySkills.promoteBackupToSkillSource",
    input: {},
    window: fakeImportWindow({
      calls: promoteCalls,
      openDialogResponses: [[{ fsPath: "/repo/backups/beta/snapshot-001" }]],
      inputResponses: ["beta-restored"],
      quickPickResponses: [],
    }),
  });

  const deleteCalls = [];
  const deleteResult = await collectCommandInput({
    commandId: "sponzeySkills.deleteBackup",
    input: {},
    window: fakeImportWindow({
      calls: deleteCalls,
      openDialogResponses: [[{ fsPath: "/repo/backups/beta/snapshot-001" }]],
      inputResponses: [],
      quickPickResponses: [
        {
          label: "Delete backup snapshot",
          value: true,
        },
      ],
    }),
  });

  assert.deepEqual(importCalls.map((call) => call.kind), [
    "openDialog",
    "inputBox",
  ]);
  assert.deepEqual(importResult.input, {
    archivePath: "/tmp/beta.sponzey-skill.json",
    skillName: "beta",
  });
  assert.deepEqual(promoteResult.input, {
    backupPath: "/repo/backups/beta/snapshot-001",
    skillName: "beta-restored",
  });
  assert.deepEqual(deleteResult.input, {
    backupPath: "/repo/backups/beta/snapshot-001",
    confirmationProvided: true,
  });
});

function fakeInputWindow({ calls, responses }) {
  return {
    async showInputBox(options) {
      calls.push(options);
      return responses.shift();
    },
  };
}

function fakeQuickPickWindow({ calls, responses }) {
  return {
    async showQuickPick(items, options) {
      calls.push({ items, options });
      return responses.shift();
    },
  };
}

function fakeTransferWindow({ calls, quickPickResponses, inputResponses }) {
  return {
    async showQuickPick(items, options) {
      calls.push({ kind: "quickPick", items, options });
      return quickPickResponses.shift();
    },
    async showInputBox(options) {
      calls.push({ kind: "inputBox", options });
      return inputResponses.shift();
    },
  };
}

function applyReadModel() {
  return {
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
        skills: [],
      },
    ],
    projectSkills: [
      {
        targetId: "project:/workspace:.agents/skills",
        clientType: "codex",
        scope: "project",
        targetPath: "/workspace/.agents/skills",
        skills: [],
      },
    ],
    diagnostics: [],
  };
}

function removeReadModel() {
  return {
    ...applyReadModel(),
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
            status: "managed",
            targetPath: "/global/alpha",
            sourceId: "alpha",
          },
        ],
      },
    ],
  };
}

function appliedAlphaSkill() {
  return {
    name: "alpha",
    kind: "managed-copy",
    status: "managed",
    targetPath: "/global/alpha",
    sourceId: "alpha",
  };
}

function changedAppliedAlphaSkill() {
  return {
    ...appliedAlphaSkill(),
    syncStatus: "Target Changed",
  };
}

function changedCopyReadModel() {
  return {
    ...removeReadModel(),
    globalSkills: [
      {
        targetId: "global:codex",
        clientType: "codex",
        scope: "global",
        targetPath: "/global",
        skills: [changedAppliedAlphaSkill()],
      },
    ],
  };
}

function globalTarget() {
  return {
    id: "global:codex",
    clientType: "codex",
    scope: "global",
    targetPath: "/global",
  };
}

function fakeImportWindow({
  calls,
  openDialogResponses,
  inputResponses,
  quickPickResponses,
}) {
  return {
    async showOpenDialog(options) {
      calls.push({ kind: "openDialog", options });
      return openDialogResponses.shift();
    },
    async showInputBox(options) {
      calls.push({ kind: "inputBox", options });
      return inputResponses.shift();
    },
    async showQuickPick(items, options) {
      calls.push({ kind: "quickPick", items, options });
      return quickPickResponses.shift();
    },
  };
}
