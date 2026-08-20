import test from "node:test";
import assert from "node:assert/strict";

import {
  globalSkillsHtml,
  iconFileNameForClient,
} from "../../src/presentation/global-skills-webview-provider.js";

test("iconFileNameForClient maps recognized AI services and aliases to their brand assets", () => {
  assert.equal(iconFileNameForClient("codex"), "agent-openai.svg");
  assert.equal(iconFileNameForClient("GPT"), "agent-openai.svg");
  assert.equal(iconFileNameForClient("claude"), "agent-claude.svg");
  assert.equal(iconFileNameForClient("Gemini"), "agent-gemini.svg");
  assert.equal(iconFileNameForClient("GitHub Copilot"), "agent-copilot.svg");
  assert.equal(iconFileNameForClient("cursor"), "agent-cursor.svg");
  assert.equal(iconFileNameForClient("perplexity"), "agent-perplexity.svg");
  assert.equal(iconFileNameForClient("mistral"), "agent-mistral.svg");
  assert.equal(iconFileNameForClient("deepseek"), "agent-deepseek.svg");
  assert.equal(iconFileNameForClient("meta ai"), "agent-meta-ai.svg");
  assert.equal(iconFileNameForClient("huggingface"), "agent-hugging-face.svg");
  assert.equal(iconFileNameForClient("unknown-agent"), "agent-generic.svg");
});

test("globalSkillsHtml renders AI images on the right without an organization left icon", () => {
  const html = globalSkillsHtml({
    readModel: {
      mainRepositorySkills: [{ id: "alpha", name: "alpha", sourcePath: "/repo/skills/alpha" }],
      globalSkills: [{
        name: "alpha",
        kind: "managed",
        sourceId: "alpha",
        clientBadges: ["claude", "codex"],
        placements: [{}, {}],
      }],
    },
    iconUri: (clientType) => `vscode-webview-resource://${clientType}.svg`,
  });

  assert.match(html, /skill-name">alpha/);
  assert.match(html, /claude\.svg/);
  assert.match(html, /codex\.svg/);
  assert.doesNotMatch(html, /organization/);
  assert.match(html, /Remove Global Skill Enrollment/);
  assert.match(html, /data-source-path="\/repo\/skills\/alpha"/);
});

test("globalSkillsHtml aligns its skill names with native tree child rows", () => {
  const html = globalSkillsHtml({
    readModel: {
      mainRepositorySkills: [],
      globalSkills: [],
    },
  });

  assert.match(html, /\.skill-row \{[^}]*padding: 0 8px 0 36px;/);
  assert.match(html, /\.context-action \{[^}]*left: 36px;/);
});
