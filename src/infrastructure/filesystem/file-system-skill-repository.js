import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { createSkillSource, normalizePath } from "../../domain/index.js";

const REPOSITORY_DIRECTORIES = ["skills", "backups", ".sponzey"];
const METADATA_PATH_PARTS = [".sponzey", "repository.json"];
const SOURCE_METADATA_FILE = ".sponzey-source.json";
const BACKUP_METADATA_FILE = ".sponzey-backup.json";
const DEFAULT_ANALYSIS_ARTIFACT_BUDGET = Object.freeze({
  maxFiles: 2000,
  maxDepth: 16,
  maxTextFileBytes: 1024 * 1024,
  maxTotalTextBytes: 32 * 1024 * 1024,
});

export class FileSystemSkillRepository {
  async createSourceSkill({ repositoryPath, skillName, description, body }) {
    const destinationResult = resolveSourceDestination({
      repositoryPath,
      skillName,
    });

    if (!destinationResult.ok) {
      return destinationResult;
    }

    const sourcePath = destinationResult.sourcePath;
    if (await canAccess(sourcePath)) {
      return sourceNameConflict();
    }

    return withFileSystemResult(async () => {
      await mkdir(sourcePath, { recursive: true });
      await writeFile(
        path.join(sourcePath, "SKILL.md"),
        renderSkillMd({
          name: skillName,
          description,
          body,
        }),
      );

      return {
        ok: true,
        source: createSkillSource({
          id: skillName,
          name: skillName,
          sourcePath,
        }).value,
      };
    }, "create-source-skill");
  }

  async importSourceSkill({
    repositoryPath,
    externalSourcePath,
    skillName,
    origin,
  }) {
    const destinationResult = resolveSourceDestination({
      repositoryPath,
      skillName,
    });

    if (!destinationResult.ok) {
      return destinationResult;
    }

    const sourcePath = destinationResult.sourcePath;
    if (await canAccess(sourcePath)) {
      return sourceNameConflict();
    }

    return withFileSystemResult(async () => {
      await cp(externalSourcePath, sourcePath, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      await writeFile(
        path.join(sourcePath, SOURCE_METADATA_FILE),
        `${JSON.stringify({ origin }, null, 2)}\n`,
      );

      return {
        ok: true,
        source: createSkillSource({
          id: skillName,
          name: skillName,
          sourcePath,
        }).value,
      };
    }, "import-source-skill");
  }

  async copyTargetSkillToMainRepository({
    repositoryPath,
    targetSkillPath,
    skillName,
    origin,
  }) {
    return this.importSourceSkill({
      repositoryPath,
      externalSourcePath: targetSkillPath,
      skillName,
      origin,
    });
  }

  async backupTargetSkillToMainRepository({
    repositoryPath,
    targetSkillPath,
    skillName,
    snapshotId,
    metadata,
  }) {
    const destinationResult = resolveBackupDestination({
      repositoryPath,
      skillName,
      snapshotId,
    });

    if (!destinationResult.ok) {
      return destinationResult;
    }

    const backupPath = destinationResult.backupPath;
    if (await canAccess(backupPath)) {
      return {
        ok: false,
        error: {
          code: "backup-snapshot-conflict",
          severity: "error",
          message: "Backup snapshot already exists.",
        },
      };
    }

    return withFileSystemResult(async () => {
      await cp(targetSkillPath, backupPath, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      await writeFile(
        path.join(backupPath, BACKUP_METADATA_FILE),
        `${JSON.stringify(metadata, null, 2)}\n`,
      );

      return {
        ok: true,
        backup: {
          skillName,
          snapshotId,
          backupPath: normalizePath(backupPath),
        },
      };
    }, "backup-target-skill-to-main-repository");
  }

  async initializeRepository({ repositoryPath }) {
    return withFileSystemResult(async () => {
      for (const directoryName of REPOSITORY_DIRECTORIES) {
        await mkdir(path.join(repositoryPath, directoryName), { recursive: true });
      }

      return {
        ok: true,
        repositoryPath: normalizePath(repositoryPath),
        createdDirectories: [...REPOSITORY_DIRECTORIES],
      };
    }, "initialize-repository");
  }

  async scanSourceSkills({ repositoryPath }) {
    return withFileSystemResult(async () => {
      const skillsPath = path.join(repositoryPath, "skills");
      const entries = await readOptionalDirectoryEntries(skillsPath);
      const sources = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const sourcePath = path.join(skillsPath, entry.name);
        const skillMdPath = path.join(sourcePath, "SKILL.md");
        const hasSkillMd = await canAccess(skillMdPath);

        if (!hasSkillMd) {
          continue;
        }

        const sourceResult = createSkillSource({
          id: entry.name,
          name: entry.name,
          sourcePath,
        });

        if (sourceResult.ok) {
          sources.push(sourceResult.value);
        }
      }

      sources.sort((left, right) => left.name.localeCompare(right.name));

      return {
        ok: true,
        sources,
      };
    }, "scan-source-skills");
  }

  async readSourceSkillFiles({ sourcePath }) {
    return withFileSystemResult(async () => {
      const files = await readDirectoryFiles({
        rootPath: sourcePath,
        currentPath: sourcePath,
      });

      return {
        ok: true,
        files,
      };
    }, "read-source-skill-files");
  }

  async readSourceSkillArtifacts({ sourcePath, budget }) {
    return withFileSystemResult(async () => {
      const normalizedBudget = analysisArtifactBudget(budget);
      const result = await readAnalysisArtifacts({
        rootPath: sourcePath,
        currentPath: sourcePath,
        depth: 0,
        budget: normalizedBudget,
        state: {
          scannedFileCount: 0,
          analyzedArtifactCount: 0,
          totalTextBytes: 0,
          artifacts: [],
          skipped: [],
        },
      });

      return {
        ok: true,
        artifacts: result.artifacts,
        coverage: {
          scannedFileCount: result.scannedFileCount,
          analyzedArtifactCount: result.analyzedArtifactCount,
          skipped: result.skipped,
        },
      };
    }, "read-source-skill-artifacts");
  }

  async writeRepositoryMetadata({ repositoryPath, metadata }) {
    return withFileSystemResult(async () => {
      const metadataPath = repositoryMetadataPath(repositoryPath);
      await mkdir(path.dirname(metadataPath), { recursive: true });
      await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

      return {
        ok: true,
        metadataPath: normalizePath(metadataPath),
      };
    }, "write-repository-metadata");
  }

  async readRepositoryMetadata({ repositoryPath }) {
    const metadataPath = repositoryMetadataPath(repositoryPath);
    let text;

    try {
      text = await readFile(metadataPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          ok: true,
          metadata: null,
          metadataPath: normalizePath(metadataPath),
        };
      }

      return fileSystemError("read-repository-metadata");
    }

    try {
      return {
        ok: true,
        metadata: JSON.parse(text),
        metadataPath: normalizePath(metadataPath),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "repository-metadata-invalid-json",
          severity: "error",
          message: "Repository metadata must be valid JSON.",
        },
      };
    }
  }

  async renameSourceSkill({ repositoryPath, oldName, newName }) {
    const oldDestination = resolveSourceDestination({
      repositoryPath,
      skillName: oldName,
    });
    const newDestination = resolveSourceDestination({
      repositoryPath,
      skillName: newName,
    });

    if (!oldDestination.ok) return oldDestination;
    if (!newDestination.ok) return newDestination;

    if (await canAccess(newDestination.sourcePath)) {
      return sourceNameConflict();
    }

    return withFileSystemResult(async () => {
      await rename(oldDestination.sourcePath, newDestination.sourcePath);
      return {
        ok: true,
        source: createSkillSource({
          id: newName,
          name: newName,
          sourcePath: newDestination.sourcePath,
        }).value,
      };
    }, "rename-source-skill");
  }

  async deleteSourceSkill({ repositoryPath, skillName }) {
    const destination = resolveSourceDestination({ repositoryPath, skillName });
    if (!destination.ok) return destination;

    return withFileSystemResult(async () => {
      await rm(destination.sourcePath, { recursive: true, force: false });
      return {
        ok: true,
        deletedSourcePath: normalizePath(destination.sourcePath),
        skillName,
      };
    }, "delete-source-skill");
  }

  async exportSourceSkill({ repositoryPath, skillName, archivePath }) {
    const destination = resolveSourceDestination({ repositoryPath, skillName });
    if (!destination.ok) return destination;
    if (!archivePath) {
      return {
        ok: false,
        error: {
          code: "archive-path-required",
          severity: "error",
          message: "Archive path is required.",
        },
      };
    }

    return withFileSystemResult(async () => {
      const files = await readDirectoryFiles({
        rootPath: destination.sourcePath,
        currentPath: destination.sourcePath,
      });
      await writeFile(
        archivePath,
        `${JSON.stringify(
          {
            format: "sponzey-skill-archive-v1",
            skillName,
            files,
          },
          null,
          2,
        )}\n`,
      );
      return {
        ok: true,
        archivePath: normalizePath(archivePath),
        skillName,
      };
    }, "export-source-skill");
  }

  async importSkillArchiveToMainRepository({ repositoryPath, archivePath, skillName }) {
    if (!archivePath || !skillName) {
      return {
        ok: false,
        error: {
          code: "archive-import-input-required",
          severity: "error",
          message: "Archive path and skill name are required.",
        },
      };
    }

    const destination = resolveSourceDestination({ repositoryPath, skillName });
    if (!destination.ok) return destination;
    if (await canAccess(destination.sourcePath)) {
      return sourceNameConflict();
    }

    return withFileSystemResult(async () => {
      const archive = JSON.parse(await readFile(archivePath, "utf8"));
      if (archive?.format !== "sponzey-skill-archive-v1") {
        return {
          ok: false,
          error: {
            code: "invalid-skill-archive",
            severity: "error",
            message: "Skill archive format is invalid.",
          },
        };
      }

      await mkdir(destination.sourcePath, { recursive: true });
      await writeArchiveFiles({
        rootPath: destination.sourcePath,
        files: archive.files ?? {},
      });
      await writeFile(
        path.join(destination.sourcePath, SOURCE_METADATA_FILE),
        `${JSON.stringify(
          {
            origin: {
              type: "archive",
              archivePath: normalizePath(archivePath),
            },
          },
          null,
          2,
        )}\n`,
      );

      return {
        ok: true,
        source: createSkillSource({
          id: skillName,
          name: skillName,
          sourcePath: destination.sourcePath,
        }).value,
      };
    }, "import-skill-archive-to-main-repository");
  }

  async scanBackups({ repositoryPath }) {
    return withFileSystemResult(async () => {
      const backupRootPath = path.join(repositoryPath, "backups");
      const backups = [];
      const diagnostics = [];

      if (!(await canAccess(backupRootPath))) {
        return { ok: true, backups, diagnostics };
      }

      const skillEntries = await readdir(backupRootPath, { withFileTypes: true });
      for (const skillEntry of skillEntries) {
        if (!skillEntry.isDirectory()) continue;
        const skillBackupRoot = path.join(backupRootPath, skillEntry.name);
        const snapshotEntries = await readdir(skillBackupRoot, { withFileTypes: true });

        for (const snapshotEntry of snapshotEntries) {
          if (!snapshotEntry.isDirectory()) continue;
          const backupPath = path.join(skillBackupRoot, snapshotEntry.name);
          const metadataPath = path.join(backupPath, BACKUP_METADATA_FILE);
          let metadata = null;
          try {
            metadata = JSON.parse(await readFile(metadataPath, "utf8"));
          } catch {
            diagnostics.push({
              code: "invalid-backup-metadata",
              severity: "warning",
              message: "Backup metadata must be valid JSON.",
              skillName: skillEntry.name,
              snapshotId: snapshotEntry.name,
            });
          }
          backups.push({
            skillName: skillEntry.name,
            snapshotId: snapshotEntry.name,
            backupPath: normalizePath(backupPath),
            metadata,
          });
        }
      }

      backups.sort((left, right) =>
        `${left.skillName}/${left.snapshotId}`.localeCompare(
          `${right.skillName}/${right.snapshotId}`,
        ),
      );
      return { ok: true, backups, diagnostics };
    }, "scan-backups");
  }

  async promoteBackupToSource({ repositoryPath, backupPath, skillName }) {
    const destination = resolveSourceDestination({ repositoryPath, skillName });
    if (!destination.ok) return destination;
    if (await canAccess(destination.sourcePath)) {
      return sourceNameConflict();
    }

    return withFileSystemResult(async () => {
      await cp(backupPath, destination.sourcePath, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      await rm(path.join(destination.sourcePath, BACKUP_METADATA_FILE), {
        force: true,
      });
      await writeFile(
        path.join(destination.sourcePath, SOURCE_METADATA_FILE),
        `${JSON.stringify(
          {
            origin: {
              type: "backup-promoted",
              backupPath: normalizePath(backupPath),
            },
          },
          null,
          2,
        )}\n`,
      );
      return {
        ok: true,
        source: createSkillSource({
          id: skillName,
          name: skillName,
          sourcePath: destination.sourcePath,
        }).value,
      };
    }, "promote-backup-to-source");
  }

  async deleteBackup({ backupPath }) {
    return withFileSystemResult(async () => {
      await rm(backupPath, { recursive: true, force: false });
      return {
        ok: true,
        deletedBackupPath: normalizePath(backupPath),
      };
    }, "delete-backup");
  }
}

async function readDirectoryFiles({ rootPath, currentPath }) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files = {};

  for (const entry of sortedEntries) {
    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      Object.assign(
        files,
        await readDirectoryFiles({ rootPath, currentPath: entryPath }),
      );
      continue;
    }

    if (entry.isFile()) {
      const relativePath = path
        .relative(rootPath, entryPath)
        .split(path.sep)
        .join("/");
      files[relativePath] = await readFile(entryPath, "utf8");
    }
  }

  return files;
}

async function readAnalysisArtifacts({
  rootPath,
  currentPath,
  depth,
  budget,
  state,
}) {
  if (depth > budget.maxDepth) {
    state.skipped.push({
      code: "analysis-artifact-depth-limit-skipped",
      relativePath: relativePathFrom({ rootPath, entryPath: currentPath }),
    });
    return state;
  }

  const entries = await readdir(currentPath, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const entry of sortedEntries) {
    const entryPath = path.join(currentPath, entry.name);
    const relativePath = relativePathFrom({ rootPath, entryPath });

    if (entry.isSymbolicLink()) {
      state.skipped.push({
        code: "analysis-artifact-symlink-skipped",
        relativePath,
      });
      continue;
    }

    if (entry.isDirectory()) {
      await readAnalysisArtifacts({
        rootPath,
        currentPath: entryPath,
        depth: depth + 1,
        budget,
        state,
      });
      continue;
    }

    if (!entry.isFile()) {
      state.skipped.push({
        code: "analysis-artifact-unsupported-kind-skipped",
        relativePath,
      });
      continue;
    }

    state.scannedFileCount += 1;
    if (state.scannedFileCount > budget.maxFiles) {
      state.skipped.push({
        code: "analysis-artifact-count-limit-skipped",
        relativePath,
      });
      continue;
    }

    const fileStat = await stat(entryPath);
    if (fileStat.size > budget.maxTextFileBytes) {
      state.skipped.push({
        code: "analysis-artifact-file-limit-skipped",
        relativePath,
        sizeBytes: fileStat.size,
      });
      continue;
    }

    if (state.totalTextBytes + fileStat.size > budget.maxTotalTextBytes) {
      state.skipped.push({
        code: "analysis-artifact-total-limit-skipped",
        relativePath,
        sizeBytes: fileStat.size,
      });
      continue;
    }

    const bytes = await readFile(entryPath);
    if (bytes.includes(0)) {
      state.skipped.push({
        code: "analysis-artifact-binary-skipped",
        relativePath,
      });
      continue;
    }

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      state.skipped.push({
        code: "analysis-artifact-invalid-encoding-skipped",
        relativePath,
      });
      continue;
    }

    state.totalTextBytes += fileStat.size;
    state.analyzedArtifactCount += 1;
    state.artifacts.push({
      relativePath,
      artifactKind: analysisArtifactKind(relativePath),
      text,
    });
  }

  return state;
}

function analysisArtifactBudget(budget = {}) {
  return {
    maxFiles: positiveInteger(budget.maxFiles, DEFAULT_ANALYSIS_ARTIFACT_BUDGET.maxFiles),
    maxDepth: positiveInteger(budget.maxDepth, DEFAULT_ANALYSIS_ARTIFACT_BUDGET.maxDepth),
    maxTextFileBytes: positiveInteger(
      budget.maxTextFileBytes,
      DEFAULT_ANALYSIS_ARTIFACT_BUDGET.maxTextFileBytes,
    ),
    maxTotalTextBytes: positiveInteger(
      budget.maxTotalTextBytes,
      DEFAULT_ANALYSIS_ARTIFACT_BUDGET.maxTotalTextBytes,
    ),
  };
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function relativePathFrom({ rootPath, entryPath }) {
  return path.relative(rootPath, entryPath).split(path.sep).join("/") || ".";
}

function analysisArtifactKind(relativePath) {
  if (relativePath === "SKILL.md") return "skill-manifest";
  if (relativePath.startsWith("scripts/")) return "script";
  if (relativePath.startsWith("references/")) return "reference";
  if (relativePath === "agents/openai.yaml") return "agent-manifest";
  return "metadata";
}

async function writeArchiveFiles({ rootPath, files }) {
  for (const [relativePath, content] of Object.entries(files)) {
    const normalizedRelativePath = String(relativePath ?? "").replaceAll("\\", "/");
    if (
      normalizedRelativePath.length === 0 ||
      normalizedRelativePath.startsWith("/") ||
      normalizedRelativePath.includes("../") ||
      normalizedRelativePath === ".."
    ) {
      throw new Error("archive path traversal");
    }

    const destinationPath = path.resolve(rootPath, normalizedRelativePath);
    if (
      destinationPath === rootPath ||
      !destinationPath.startsWith(`${path.resolve(rootPath)}${path.sep}`)
    ) {
      throw new Error("archive path traversal");
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, String(content ?? ""));
  }
}

function resolveBackupDestination({ repositoryPath, skillName, snapshotId }) {
  const normalizedSkillName = String(skillName ?? "").trim();
  const normalizedSnapshotId = String(snapshotId ?? "").trim();

  if (
    normalizedSkillName.length === 0 ||
    normalizedSnapshotId.length === 0 ||
    path.isAbsolute(normalizedSkillName) ||
    path.isAbsolute(normalizedSnapshotId)
  ) {
    return backupPathTraversalRejected();
  }

  const backupRootPath = path.resolve(repositoryPath, "backups");
  const backupPath = path.resolve(
    backupRootPath,
    normalizedSkillName,
    normalizedSnapshotId,
  );

  if (
    backupPath === backupRootPath ||
    !backupPath.startsWith(`${backupRootPath}${path.sep}`)
  ) {
    return backupPathTraversalRejected();
  }

  return {
    ok: true,
    backupPath,
  };
}

function resolveSourceDestination({ repositoryPath, skillName }) {
  const normalizedSkillName = String(skillName ?? "").trim();

  if (
    normalizedSkillName.length === 0 ||
    path.isAbsolute(normalizedSkillName)
  ) {
    return sourcePathTraversalRejected();
  }

  const skillsRootPath = path.resolve(repositoryPath, "skills");
  const sourcePath = path.resolve(skillsRootPath, normalizedSkillName);

  if (
    sourcePath === skillsRootPath ||
    !sourcePath.startsWith(`${skillsRootPath}${path.sep}`)
  ) {
    return sourcePathTraversalRejected();
  }

  return {
    ok: true,
    sourcePath,
  };
}

function renderSkillMd({ name, description, body }) {
  return [
    "---",
    `name: ${name}`,
    `description: ${String(description ?? "").trim()}`,
    "---",
    "",
    String(body ?? "").trim(),
    "",
  ].join("\n");
}

function sourceNameConflict() {
  return {
    ok: false,
    error: {
      code: "source-name-conflict",
      severity: "error",
      message: "Source skill already exists.",
    },
  };
}

function sourcePathTraversalRejected() {
  return {
    ok: false,
    error: {
      code: "source-path-traversal-rejected",
      severity: "error",
      message: "Source skill name must stay inside the repository skills directory.",
    },
  };
}

function backupPathTraversalRejected() {
  return {
    ok: false,
    error: {
      code: "backup-path-traversal-rejected",
      severity: "error",
      message: "Backup path must stay inside the repository backups directory.",
    },
  };
}

function repositoryMetadataPath(repositoryPath) {
  return path.join(repositoryPath, ...METADATA_PATH_PARTS);
}

async function canAccess(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalDirectoryEntries(directoryPath) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function withFileSystemResult(operation, operationName) {
  try {
    return await operation();
  } catch (error) {
    return fileSystemError(operationName, error);
  }
}

function fileSystemError(operationName, error) {
  return {
    ok: false,
    error: {
      code: "filesystem-operation-failed",
      severity: "error",
      operation: operationName,
      message: `Filesystem operation failed during ${operationName}.`,
      cause: error?.code,
    },
  };
}
