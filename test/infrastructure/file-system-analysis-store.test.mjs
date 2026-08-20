import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FileSystemAnalysisStore } from "../../src/infrastructure/index.js";

test("FileSystemAnalysisStore writes metadata under repository analysis directory", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-analysis-store-"),
  );
  const store = new FileSystemAnalysisStore();

  try {
    const result = await store.writeAnalysisMetadata({
      repositoryPath,
      metadata: {
        schemaVersion: 2,
        analyzerVersion: "test-analyzer",
        skillId: "../unsafe skill",
        skillName: "../unsafe skill",
        sourceHash: "source-hash",
        analyzedAt: "2026-07-01T00:00:00.000Z",
        riskLevel: "low",
        rulePackVersion: "builtin-policy-v1",
        riskDecision: { riskLevel: "low" },
        findings: [],
        coverage: { scannedFileCount: 1, analyzedArtifactCount: 1, skipped: [] },
        diagnostics: [],
        dependencies: [],
        compatibility: {},
      },
    });

    assert.equal(result.ok, true);
    assert.match(result.metadataPath, /\.sponzey\/analysis\/.+\.json$/);

    const saved = JSON.parse(await readFile(result.metadataPath, "utf8"));
    assert.equal(saved.skillId, "../unsafe skill");
    assert.equal(saved.sourceHash, "source-hash");

    await assert.rejects(
      () => access(path.join(repositoryPath, "..", "unsafe skill.json")),
      { code: "ENOENT" },
    );
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("FileSystemAnalysisStore rejects invalid metadata before writing", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-analysis-store-"),
  );
  const store = new FileSystemAnalysisStore();

  try {
    const result = await store.writeAnalysisMetadata({
      repositoryPath,
      metadata: {
        schemaVersion: 2,
        skillId: "alpha",
      },
    });

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "analysis-metadata-invalid",
        severity: "error",
        message: "Analysis metadata is missing required fields.",
      },
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("FileSystemAnalysisStore reports unsupported metadata schema version", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-analysis-store-"),
  );
  const store = new FileSystemAnalysisStore();

  try {
    const writeResult = await store.writeAnalysisMetadata({
      repositoryPath,
      metadata: {
        schemaVersion: 2,
        analyzerVersion: "test-analyzer",
        skillId: "alpha",
        skillName: "alpha",
        sourceHash: "source-hash",
        analyzedAt: "2026-07-01T00:00:00.000Z",
        riskLevel: "low",
        rulePackVersion: "builtin-policy-v1",
        riskDecision: { riskLevel: "low" },
        findings: [],
        coverage: { scannedFileCount: 1, analyzedArtifactCount: 1, skipped: [] },
        diagnostics: [],
        dependencies: [],
        compatibility: {},
      },
    });
    assert.equal(writeResult.ok, true);

    await writeFile(
      writeResult.metadataPath,
      `${JSON.stringify({
        schemaVersion: 999,
        analyzerVersion: "future-analyzer",
        skillId: "alpha",
        skillName: "alpha",
        sourceHash: "source-hash",
        analyzedAt: "2026-07-01T00:00:00.000Z",
        riskLevel: "low",
        diagnostics: [],
        dependencies: [],
        compatibility: {},
      })}\n`,
    );

    const result = await store.readAnalysisMetadata({
      repositoryPath,
      skillId: "alpha",
    });

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "analysis-metadata-unsupported-version",
        severity: "warning",
        category: "analysis",
        message: "Analysis metadata schema version is unsupported.",
        recommendation: "Run Analyze All Skills again.",
      },
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("FileSystemAnalysisStore treats v1 metadata as stale without rewriting it", async () => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), "sponzey-analysis-store-"));
  const store = new FileSystemAnalysisStore();
  try {
    const analysisDirectory = path.join(repositoryPath, ".sponzey", "analysis");
    const metadataPath = path.join(analysisDirectory, Buffer.from("alpha").toString("base64url") + ".json");
    await mkdir(analysisDirectory, { recursive: true });
    await writeFile(metadataPath, JSON.stringify({ schemaVersion: 1 }));
    const result = await store.readAnalysisMetadata({ repositoryPath, skillId: "alpha" });
    assert.equal(result.error.code, "analysis-metadata-stale-version");
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
