import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgePotentialFinding } from "../../src/application/index.js";

test("acknowledgePotentialFinding persists only an exact potential identity", async () => {
  const writes = [];
  const result = await acknowledgePotentialFinding({
    context: { mainRepositoryPath: "/repo" },
    input: {
      sourceHash: "source-1",
      finding: { findingKind: "potential", code: "potential-network-transfer", evidenceFingerprint: "evidence-1" },
    },
    triageStore: { async writeAcknowledgement(value) { writes.push(value); return { ok: true }; } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(writes, [{ repositoryPath: "/repo", acknowledgement: { sourceHash: "source-1", ruleCode: "potential-network-transfer", evidenceFingerprint: "evidence-1" } }]);
});

test("acknowledgePotentialFinding rejects confirmed critical without writing", async () => {
  const result = await acknowledgePotentialFinding({
    context: { mainRepositoryPath: "/repo" },
    input: { sourceHash: "source-1", finding: { findingKind: "confirmed", riskLevel: "critical", code: "destructive-rm-rf", evidenceFingerprint: "evidence-1" } },
    triageStore: { async writeAcknowledgement() { throw new Error("must not write"); } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "confirmed-critical-acknowledgement-forbidden");
});
