import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FileSystemAnalysisTriageStore } from "../../src/infrastructure/index.js";

test("analysis triage store atomically persists only acknowledgement identity", async () => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), "sponzey-triage-"));
  const store = new FileSystemAnalysisTriageStore();
  try {
    const result = await store.writeAcknowledgement({
      repositoryPath,
      acknowledgement: {
        sourceHash: "source-1",
        ruleCode: "potential-network-transfer",
        evidenceFingerprint: "evidence-1",
        rawMatch: "do-not-store",
      },
    });
    assert.equal(result.ok, true);
    const stored = await readFile(result.triagePath, "utf8");
    assert.equal(stored.includes("do-not-store"), false);
    assert.deepEqual(await store.readAcknowledgements({ repositoryPath }), {
      ok: true,
      acknowledgements: [{ sourceHash: "source-1", ruleCode: "potential-network-transfer", evidenceFingerprint: "evidence-1" }],
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
