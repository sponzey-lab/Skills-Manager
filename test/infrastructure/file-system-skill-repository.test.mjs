import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { FileSystemSkillRepository } from "../../src/infrastructure/filesystem/file-system-skill-repository.js";

test("initializeRepository creates main repository directories in explicit path", async () => {
  const repositoryPath = await createTempPath("ssm-repo-init-");
  const repository = new FileSystemSkillRepository();

  const result = await repository.initializeRepository({ repositoryPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.createdDirectories, ["skills", "backups", ".sponzey"]);
  await assertDirectory(path.join(repositoryPath, "skills"));
  await assertDirectory(path.join(repositoryPath, "backups"));
  await assertDirectory(path.join(repositoryPath, ".sponzey"));
});

test("scanSourceSkills returns only skills/* directories that contain SKILL.md", async () => {
  const repositoryPath = await createTempPath("ssm-repo-scan-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await mkdir(path.join(repositoryPath, "skills", "valid"), { recursive: true });
  await mkdir(path.join(repositoryPath, "skills", "no-skill"), { recursive: true });
  await mkdir(path.join(repositoryPath, "outside"), { recursive: true });
  await writeFile(path.join(repositoryPath, "skills", "valid", "SKILL.md"), "body");
  await writeFile(path.join(repositoryPath, "skills", "no-skill", "README.md"), "readme");
  await writeFile(path.join(repositoryPath, "outside", "SKILL.md"), "body");

  const result = await repository.scanSourceSkills({ repositoryPath });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.sources.map((source) => source.name),
    ["valid"],
  );
  assert.equal(result.sources[0].id, "valid");
  assert.equal(result.sources[0].sourcePath.endsWith("/skills/valid"), true);
});

test("scanSourceSkills returns empty sources when skills directory is missing", async () => {
  const repositoryPath = await createTempPath("ssm-repo-missing-skills-");
  const repository = new FileSystemSkillRepository();

  const result = await repository.scanSourceSkills({ repositoryPath });

  assert.deepEqual(result, {
    ok: true,
    sources: [],
  });
});

test("repository metadata can be written and read from .sponzey/repository.json", async () => {
  const repositoryPath = await createTempPath("ssm-repo-metadata-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  const metadata = Object.freeze({
    schemaVersion: 1,
    repositoryId: "repo-1",
    updatedAt: "2026-06-28T00:00:00.000Z",
  });

  const writeResult = await repository.writeRepositoryMetadata({
    repositoryPath,
    metadata,
  });
  const readResult = await repository.readRepositoryMetadata({ repositoryPath });

  assert.equal(writeResult.ok, true);
  assert.equal(writeResult.metadataPath.endsWith("/.sponzey/repository.json"), true);
  assert.equal(
    await readFile(path.join(repositoryPath, ".sponzey", "repository.json"), "utf8"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  assert.deepEqual(readResult, {
    ok: true,
    metadata,
    metadataPath: writeResult.metadataPath,
  });
});

test("invalid repository metadata returns typed parse error without throwing", async () => {
  const repositoryPath = await createTempPath("ssm-repo-invalid-json-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await writeFile(
    path.join(repositoryPath, ".sponzey", "repository.json"),
    "{ invalid json",
  );

  const result = await repository.readRepositoryMetadata({ repositoryPath });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "repository-metadata-invalid-json",
      severity: "error",
      message: "Repository metadata must be valid JSON.",
    },
  });
});

test("createSourceSkill writes SKILL.md inside main repository skills directory", async () => {
  const repositoryPath = await createTempPath("ssm-repo-create-source-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });

  const result = await repository.createSourceSkill({
    repositoryPath,
    skillName: "helper",
    description: "Use this skill when writing helper code.",
    body: "Help with focused implementation.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.name, "helper");
  assert.equal(result.source.sourcePath.endsWith("/skills/helper"), true);
  assert.equal(
    await readFile(path.join(repositoryPath, "skills", "helper", "SKILL.md"), "utf8"),
    [
      "---",
      "name: helper",
      "description: Use this skill when writing helper code.",
      "---",
      "",
      "Help with focused implementation.",
      "",
    ].join("\n"),
  );
});

test("createSourceSkill rejects existing source and path traversal", async () => {
  const repositoryPath = await createTempPath("ssm-repo-create-reject-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await mkdir(path.join(repositoryPath, "skills", "existing"), { recursive: true });

  const conflictResult = await repository.createSourceSkill({
    repositoryPath,
    skillName: "existing",
    description: "Description",
    body: "Body",
  });
  const traversalResult = await repository.createSourceSkill({
    repositoryPath,
    skillName: "../escape",
    description: "Description",
    body: "Body",
  });

  assert.deepEqual(conflictResult, {
    ok: false,
    error: {
      code: "source-name-conflict",
      severity: "error",
      message: "Source skill already exists.",
    },
  });
  assert.deepEqual(traversalResult, {
    ok: false,
    error: {
      code: "source-path-traversal-rejected",
      severity: "error",
      message: "Source skill name must stay inside the repository skills directory.",
    },
  });
});

test("importSourceSkill copies external folder and writes origin metadata", async () => {
  const repositoryPath = await createTempPath("ssm-repo-import-");
  const externalPath = await createTempPath("ssm-external-skill-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await writeFile(path.join(externalPath, "SKILL.md"), "external");
  await mkdir(path.join(externalPath, "references"), { recursive: true });
  await writeFile(path.join(externalPath, "references", "info.md"), "reference");
  const origin = {
    type: "local-folder",
    path: externalPath,
  };

  const result = await repository.importSourceSkill({
    repositoryPath,
    externalSourcePath: externalPath,
    skillName: "imported",
    origin,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.name, "imported");
  assert.equal(
    await readFile(path.join(repositoryPath, "skills", "imported", "SKILL.md"), "utf8"),
    "external",
  );
  assert.equal(
    await readFile(
      path.join(repositoryPath, "skills", "imported", "references", "info.md"),
      "utf8",
    ),
    "reference",
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(repositoryPath, "skills", "imported", ".sponzey-source.json"),
        "utf8",
      ),
    ),
    { origin },
  );
});

test("readSourceSkillFiles returns source files keyed by relative paths", async () => {
  const repositoryPath = await createTempPath("ssm-repo-read-source-files-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  const sourcePath = path.join(repositoryPath, "skills", "reader");
  await mkdir(path.join(sourcePath, "references"), { recursive: true });
  await writeFile(path.join(sourcePath, "SKILL.md"), "skill body");
  await writeFile(
    path.join(sourcePath, "references", "details.md"),
    "reference body",
  );

  const result = await repository.readSourceSkillFiles({ sourcePath });

  assert.deepEqual(result, {
    ok: true,
    files: {
      "SKILL.md": "skill body",
      "references/details.md": "reference body",
    },
  });
});

test("readSourceSkillArtifacts enforces analysis budgets without following links", async () => {
  const repositoryPath = await createTempPath("ssm-repo-analysis-artifacts-");
  const outsidePath = await createTempPath("ssm-repo-analysis-outside-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  const sourcePath = path.join(repositoryPath, "skills", "reader");
  await mkdir(path.join(sourcePath, "scripts"), { recursive: true });
  await writeFile(path.join(sourcePath, "SKILL.md"), "safe skill");
  await writeFile(path.join(sourcePath, "scripts", "large.sh"), "x".repeat(32));
  await writeFile(path.join(sourcePath, "scripts", "binary.bin"), Buffer.from([0, 1, 2]));
  await writeFile(path.join(outsidePath, "outside.md"), "outside");
  await symlink(outsidePath, path.join(sourcePath, "linked-outside"));

  const result = await repository.readSourceSkillArtifacts({
    sourcePath,
    budget: {
      maxFiles: 10,
      maxDepth: 4,
      maxTextFileBytes: 16,
      maxTotalTextBytes: 64,
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.artifacts.map((artifact) => artifact.relativePath),
    ["SKILL.md"],
  );
  assert.deepEqual(result.coverage.skipped, [
    {
      code: "analysis-artifact-symlink-skipped",
      relativePath: "linked-outside",
    },
    {
      code: "analysis-artifact-binary-skipped",
      relativePath: "scripts/binary.bin",
    },
    {
      code: "analysis-artifact-file-limit-skipped",
      relativePath: "scripts/large.sh",
      sizeBytes: 32,
    },
  ]);
});

test("readSourceSkillArtifacts reports encoding, depth, and count coverage gaps", async () => {
  const repositoryPath = await createTempPath("ssm-repo-analysis-coverage-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  const sourcePath = path.join(repositoryPath, "skills", "reader");
  await mkdir(path.join(sourcePath, "nested", "deeper"), { recursive: true });
  await writeFile(path.join(sourcePath, "SKILL.md"), "safe skill");
  await writeFile(path.join(sourcePath, "broken.txt"), Buffer.from([0xc3, 0x28]));
  await writeFile(path.join(sourcePath, "nested", "deeper", "hidden.md"), "hidden");

  const result = await repository.readSourceSkillArtifacts({
    sourcePath,
    budget: {
      maxFiles: 1,
      maxDepth: 1,
      maxTextFileBytes: 64,
      maxTotalTextBytes: 64,
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.coverage.skipped, [
    {
      code: "analysis-artifact-invalid-encoding-skipped",
      relativePath: "broken.txt",
    },
    {
      code: "analysis-artifact-depth-limit-skipped",
      relativePath: "nested/deeper",
    },
    {
      code: "analysis-artifact-count-limit-skipped",
      relativePath: "SKILL.md",
    },
  ]);
});

test("copyTargetSkillToMainRepository copies target skill into skills without overwrite", async () => {
  const repositoryPath = await createTempPath("ssm-repo-copy-target-");
  const targetSkillPath = await createTempPath("ssm-target-source-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await writeFile(path.join(targetSkillPath, "SKILL.md"), "target skill");
  const origin = {
    type: "target-copy",
    targetId: "global:codex",
    targetPath: targetSkillPath,
  };

  const result = await repository.copyTargetSkillToMainRepository({
    repositoryPath,
    targetSkillPath,
    skillName: "copied",
    origin,
  });
  const conflictResult = await repository.copyTargetSkillToMainRepository({
    repositoryPath,
    targetSkillPath,
    skillName: "copied",
    origin,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.name, "copied");
  assert.equal(
    await readFile(path.join(repositoryPath, "skills", "copied", "SKILL.md"), "utf8"),
    "target skill",
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(repositoryPath, "skills", "copied", ".sponzey-source.json"),
        "utf8",
      ),
    ),
    { origin },
  );
  assert.equal(conflictResult.ok, false);
  assert.equal(conflictResult.error.code, "source-name-conflict");
});

test("backupTargetSkillToMainRepository writes snapshot without mutating target", async () => {
  const repositoryPath = await createTempPath("ssm-repo-backup-target-");
  const targetSkillPath = await createTempPath("ssm-target-backup-source-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await writeFile(path.join(targetSkillPath, "SKILL.md"), "target skill");
  const metadata = {
    type: "target-backup",
    targetId: "global:codex",
    targetPath: targetSkillPath,
    skillName: "external",
    snapshotId: "snapshot-001",
  };

  const result = await repository.backupTargetSkillToMainRepository({
    repositoryPath,
    targetSkillPath,
    skillName: "external",
    snapshotId: "snapshot-001",
    metadata,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.backup, {
    skillName: "external",
    snapshotId: "snapshot-001",
    backupPath: normalizeExpectedPath(
      path.join(repositoryPath, "backups", "external", "snapshot-001"),
    ),
  });
  assert.equal(
    await readFile(
      path.join(repositoryPath, "backups", "external", "snapshot-001", "SKILL.md"),
      "utf8",
    ),
    "target skill",
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(
          repositoryPath,
          "backups",
          "external",
          "snapshot-001",
          ".sponzey-backup.json",
        ),
        "utf8",
      ),
    ),
    metadata,
  );
  assert.equal(await readFile(path.join(targetSkillPath, "SKILL.md"), "utf8"), "target skill");
});

test("renameSourceSkill and deleteSourceSkill mutate only source directory", async () => {
  const repositoryPath = await createTempPath("ssm-repo-source-lifecycle-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await repository.createSourceSkill({
    repositoryPath,
    skillName: "old-name",
    description: "Description",
    body: "Body",
  });

  const renameResult = await repository.renameSourceSkill({
    repositoryPath,
    oldName: "old-name",
    newName: "new-name",
  });
  const deleteResult = await repository.deleteSourceSkill({
    repositoryPath,
    skillName: "new-name",
  });

  assert.equal(renameResult.ok, true);
  assert.equal(renameResult.source.name, "new-name");
  await assertRejectsMissing(path.join(repositoryPath, "skills", "old-name"));
  await assertRejectsMissing(path.join(repositoryPath, "skills", "new-name"));
  assert.equal(deleteResult.ok, true);
  assert.equal(deleteResult.skillName, "new-name");
});

test("exportSourceSkill and importSkillArchiveToMainRepository roundtrip source files", async () => {
  const repositoryPath = await createTempPath("ssm-repo-archive-");
  const archivePath = path.join(repositoryPath, "alpha.sponzey-skill.json");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await repository.createSourceSkill({
    repositoryPath,
    skillName: "alpha",
    description: "Description",
    body: "Body",
  });
  await mkdir(path.join(repositoryPath, "skills", "alpha", "references"), {
    recursive: true,
  });
  await writeFile(
    path.join(repositoryPath, "skills", "alpha", "references", "info.md"),
    "reference",
  );

  const exportResult = await repository.exportSourceSkill({
    repositoryPath,
    skillName: "alpha",
    archivePath,
  });
  const importResult = await repository.importSkillArchiveToMainRepository({
    repositoryPath,
    archivePath,
    skillName: "alpha-imported",
  });

  assert.equal(exportResult.ok, true);
  assert.deepEqual(JSON.parse(await readFile(archivePath, "utf8")).format, "sponzey-skill-archive-v1");
  assert.equal(importResult.ok, true);
  assert.equal(
    await readFile(
      path.join(repositoryPath, "skills", "alpha-imported", "references", "info.md"),
      "utf8",
    ),
    "reference",
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(
          repositoryPath,
          "skills",
          "alpha-imported",
          ".sponzey-source.json",
        ),
        "utf8",
      ),
    ).origin,
    {
      type: "archive",
      archivePath: normalizeExpectedPath(archivePath),
    },
  );
});

test("scanBackups, promoteBackupToSource, and deleteBackup manage backup catalog", async () => {
  const repositoryPath = await createTempPath("ssm-repo-backup-catalog-");
  const targetSkillPath = await createTempPath("ssm-target-backup-catalog-");
  const repository = new FileSystemSkillRepository();
  await repository.initializeRepository({ repositoryPath });
  await writeFile(path.join(targetSkillPath, "SKILL.md"), "backup body");
  await repository.backupTargetSkillToMainRepository({
    repositoryPath,
    targetSkillPath,
    skillName: "alpha",
    snapshotId: "snapshot-001",
    metadata: {
      type: "target-backup",
      skillName: "alpha",
    },
  });

  const scanResult = await repository.scanBackups({ repositoryPath });
  const promoteResult = await repository.promoteBackupToSource({
    repositoryPath,
    backupPath: path.join(repositoryPath, "backups", "alpha", "snapshot-001"),
    skillName: "alpha-restored",
  });
  const deleteResult = await repository.deleteBackup({
    backupPath: path.join(repositoryPath, "backups", "alpha", "snapshot-001"),
  });

  assert.equal(scanResult.ok, true);
  assert.equal(scanResult.backups[0].skillName, "alpha");
  assert.equal(scanResult.backups[0].snapshotId, "snapshot-001");
  assert.equal(promoteResult.ok, true);
  assert.equal(
    await readFile(
      path.join(repositoryPath, "skills", "alpha-restored", "SKILL.md"),
      "utf8",
    ),
    "backup body",
  );
  await assertRejectsMissing(
    path.join(repositoryPath, "skills", "alpha-restored", ".sponzey-backup.json"),
  );
  assert.equal(deleteResult.ok, true);
  await assertRejectsMissing(
    path.join(repositoryPath, "backups", "alpha", "snapshot-001"),
  );
});

async function createTempPath(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function assertDirectory(directoryPath) {
  const stats = await stat(directoryPath);
  assert.equal(stats.isDirectory(), true);
}

async function assertRejectsMissing(filePath) {
  await assert.rejects(() => stat(filePath), { code: "ENOENT" });
}

function normalizeExpectedPath(value) {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}
