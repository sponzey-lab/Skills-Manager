import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FileSystemHashPort } from "../../src/infrastructure/filesystem/file-system-hash-port.js";

test("FileSystemHashPort hashes a readable directory within its target root and rejects a sibling", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sponzey-hash-"));
  const targetRoot = path.join(temporaryRoot, "target");
  const skillPath = path.join(targetRoot, "skill");
  const siblingPath = path.join(temporaryRoot, "sibling");
  await mkdir(skillPath, { recursive: true });
  await mkdir(siblingPath, { recursive: true });
  await writeFile(path.join(skillPath, "SKILL.md"), "---\nname: alpha\n---\n");
  await writeFile(path.join(siblingPath, "SKILL.md"), "outside");

  const port = new FileSystemHashPort();
  const inside = await port.hashDirectoryWithinRoot({ rootPath: targetRoot, directoryPath: skillPath });
  const outside = await port.hashDirectoryWithinRoot({ rootPath: targetRoot, directoryPath: siblingPath });

  assert.equal(inside.ok, true);
  assert.equal(typeof inside.hash, "string");
  assert.equal(outside.ok, false);
  assert.equal(outside.error.code, "directory-hash-outside-target-root");
});
