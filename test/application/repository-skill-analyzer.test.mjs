import test from "node:test";
import assert from "node:assert/strict";

import { createRepositorySkillAnalyzer } from "../../src/application/analysis/repository-skill-analyzer.js";

test("repository analyzer uses bounded artifact reader instead of legacy file reader", async () => {
  let legacyReadCalled = false;
  const analyzer = createRepositorySkillAnalyzer({
    skillRepository: {
      async readSourceSkillArtifacts() {
        return {
          ok: true,
          artifacts: [
            {
              relativePath: "SKILL.md",
              artifactKind: "skill-manifest",
              text: [
                "---",
                "name: safe",
                "description: Use this skill when validating artifact analysis delegation.",
                "---",
              ].join("\n"),
            },
          ],
          coverage: {
            scannedFileCount: 1,
            analyzedArtifactCount: 1,
            skipped: [],
          },
        };
      },
      async readSourceSkillFiles() {
        legacyReadCalled = true;
        return { ok: false };
      },
    },
  });

  const result = await analyzer.analyzeSourceSkill({
    source: { name: "safe", sourcePath: "/repo/skills/safe" },
  });

  assert.equal(legacyReadCalled, false);
  assert.equal(result.riskLevel, "low");
  assert.equal(result.coverage.analyzedArtifactCount, 1);
});
