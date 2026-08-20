import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  FileSystemGlobalSkillEnrollmentStore,
  FileSystemRepositoryIndexStore,
} from "../../src/infrastructure/index.js";

test("FileSystemGlobalSkillEnrollmentStore atomically round-trips versioned enrollments", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-global-enrollment-"),
  );
  const store = new FileSystemGlobalSkillEnrollmentStore();
  const enrollments = [
    {
      sourceSkillId: "source:alpha",
      defaultApplyMode: "symlink",
      lifecycle: "active",
      placements: [
        {
          targetId: "global:codex",
          applyMode: "symlink",
        },
      ],
      remainingCleanupPlacements: [],
    },
  ];

  try {
    const writeResult = await store.writeGlobalSkillEnrollments({
      repositoryPath,
      enrollments,
    });
    const readResult = await store.readGlobalSkillEnrollments({
      repositoryPath,
    });

    assert.equal(writeResult.ok, true);
    assert.match(writeResult.metadataPath, /\.sponzey\/global-enrollments\.json$/);
    assert.deepEqual(readResult, {
      ok: true,
      enrollments: [
        {
          kind: "GlobalSkillEnrollment",
          sourceSkillId: "source:alpha",
          defaultApplyMode: "symlink",
          lifecycle: "active",
          placements: [
            {
              kind: "AppliedSkillPlacement",
              targetId: "global:codex",
              applyMode: "symlink",
            },
          ],
          remainingCleanupPlacements: [],
        },
      ],
      metadataPath: writeResult.metadataPath,
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("FileSystemGlobalSkillEnrollmentStore rejects invalid JSON and unsupported schema", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-global-enrollment-"),
  );
  const store = new FileSystemGlobalSkillEnrollmentStore();
  const metadataPath = path.join(
    repositoryPath,
    ".sponzey",
    "global-enrollments.json",
  );

  try {
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, "{not-json");
    assert.equal(
      (await store.readGlobalSkillEnrollments({ repositoryPath })).error.code,
      "global-enrollment-invalid-json",
    );

    await writeFile(metadataPath, '{"schemaVersion":2,"enrollments":[]}');
    assert.equal(
      (await store.readGlobalSkillEnrollments({ repositoryPath })).error.code,
      "global-enrollment-unsupported-version",
    );
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("FileSystemRepositoryIndexStore writes and reads index metadata", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-repository-index-"),
  );
  const store = new FileSystemRepositoryIndexStore();

  try {
    const index = {
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
    };

    const writeResult = await store.writeRepositoryIndex({
      repositoryPath,
      index,
    });
    const readResult = await store.readRepositoryIndex({ repositoryPath });

    assert.equal(writeResult.ok, true);
    assert.match(writeResult.metadataPath, /\.sponzey\/index\.json$/);
    assert.equal(
      await readFile(writeResult.metadataPath, "utf8"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    assert.deepEqual(readResult, {
      ok: true,
      index,
      metadataPath: writeResult.metadataPath,
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("FileSystemRepositoryIndexStore returns null index when metadata is missing", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-repository-index-"),
  );
  const store = new FileSystemRepositoryIndexStore();

  try {
    const result = await store.readRepositoryIndex({ repositoryPath });

    assert.deepEqual(result, {
      ok: true,
      index: null,
      metadataPath: path
        .join(repositoryPath, ".sponzey", "index.json")
        .replaceAll("\\", "/"),
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("FileSystemRepositoryIndexStore reports unsupported schema version", async () => {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "sponzey-repository-index-"),
  );
  const store = new FileSystemRepositoryIndexStore();

  try {
    await mkdir(path.join(repositoryPath, ".sponzey"), { recursive: true });
    await writeFile(
      path.join(repositoryPath, ".sponzey", "index.json"),
      `${JSON.stringify({
        schemaVersion: 999,
        indexedAt: "2026-07-01T00:00:00.000Z",
        sources: [],
      })}\n`,
    );

    const result = await store.readRepositoryIndex({ repositoryPath });

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "repository-index-unsupported-version",
        severity: "warning",
        category: "repository",
        message: "Repository index schema version is unsupported.",
        recommendation: "Refresh the Main Repository to rebuild the index.",
      },
    });
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
