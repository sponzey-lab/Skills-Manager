import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { normalizePath } from "../../domain/index.js";

const DEFAULT_IGNORED_FILE_NAMES = new Set([
  ".sponzey-applied.json",
  ".sponzey-source.json",
  ".sponzey-backup.json",
]);

export class FileSystemHashPort {
  async hashDirectory({ directoryPath, ignoredFileNames = DEFAULT_IGNORED_FILE_NAMES }) {
    try {
      const hash = createHash("sha256");
      const files = await collectFiles({ rootPath: directoryPath, currentPath: directoryPath });

      for (const filePath of files) {
        const fileName = path.basename(filePath);
        if (ignoredFileNames.has(fileName)) {
          continue;
        }

        const relativePath = normalizePath(path.relative(directoryPath, filePath));
        hash.update(relativePath);
        hash.update("\0");
        hash.update(await readFile(filePath));
        hash.update("\0");
      }

      return {
        ok: true,
        directoryPath: normalizePath(directoryPath),
        hash: hash.digest("hex"),
        fileCount: files.length,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "directory-hash-failed",
          severity: "error",
          message: "Directory hash calculation failed.",
        },
      };
    }
  }

  async hashDirectoryWithinRoot({ rootPath, directoryPath, ignoredFileNames = DEFAULT_IGNORED_FILE_NAMES }) {
    try {
      const [resolvedRoot, resolvedDirectory] = await Promise.all([
        realpath(rootPath),
        realpath(directoryPath),
      ]);
      const relative = path.relative(resolvedRoot, resolvedDirectory);
      if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return {
          ok: false,
          error: {
            code: "directory-hash-outside-target-root",
            severity: "warning",
            message: "Target skill content is outside its declared target root.",
          },
        };
      }
      return this.hashDirectory({ directoryPath: resolvedDirectory, ignoredFileNames });
    } catch {
      return {
        ok: false,
        error: {
          code: "directory-hash-failed",
          severity: "error",
          message: "Directory hash calculation failed.",
        },
      };
    }
  }
}

async function collectFiles({ rootPath, currentPath }) {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files = [];

  for (const entry of sortedEntries) {
    const entryPath = path.join(currentPath, entry.name);
    const stats = await lstat(entryPath);

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...(await collectFiles({ rootPath, currentPath: entryPath })));
      continue;
    }

    if (stats.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}
