import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createGlobalSkillEnrollment,
  GLOBAL_SKILL_ENROLLMENT_SCHEMA_VERSION,
  normalizePath,
} from "../../domain/index.js";

/**
 * Persists canonical Global enrollment intent under the main repository.
 * Writes use a sibling temporary file and rename so a reader sees either the
 * previous complete document or the next complete document.
 */
export class FileSystemGlobalSkillEnrollmentStore {
  async readGlobalSkillEnrollments({ repositoryPath }) {
    const metadataPath = globalEnrollmentPath(repositoryPath);

    try {
      const document = JSON.parse(await readFile(metadataPath, "utf8"));
      const validation = validateDocument(document);
      if (!validation.ok) {
        return validation;
      }

      return {
        ok: true,
        enrollments: validation.enrollments,
        metadataPath: normalizePath(metadataPath),
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          ok: true,
          enrollments: [],
          metadataPath: normalizePath(metadataPath),
        };
      }
      if (error instanceof SyntaxError) {
        return failure({
          code: "global-enrollment-invalid-json",
          message: "Global enrollment metadata is not valid JSON.",
        });
      }
      return failure({
        code: "global-enrollment-read-failed",
        message: "Global enrollment metadata could not be read.",
      });
    }
  }

  async writeGlobalSkillEnrollments({ repositoryPath, enrollments }) {
    const validation = validateDocument({
      schemaVersion: GLOBAL_SKILL_ENROLLMENT_SCHEMA_VERSION,
      enrollments,
    });
    if (!validation.ok) {
      return validation;
    }

    const metadataPath = globalEnrollmentPath(repositoryPath);
    const temporaryPath = `${metadataPath}.tmp`;
    try {
      await mkdir(path.dirname(metadataPath), { recursive: true });
      await writeFile(
        temporaryPath,
        `${JSON.stringify(
          {
            schemaVersion: GLOBAL_SKILL_ENROLLMENT_SCHEMA_VERSION,
            enrollments: validation.enrollments.map(serializeEnrollment),
          },
          null,
          2,
        )}\n`,
      );
      await rename(temporaryPath, metadataPath);
      return { ok: true, metadataPath: normalizePath(metadataPath) };
    } catch {
      await unlink(temporaryPath).catch(() => {});
      return failure({
        code: "global-enrollment-write-failed",
        message: "Global enrollment metadata could not be written.",
      });
    }
  }
}

function globalEnrollmentPath(repositoryPath) {
  return path.join(repositoryPath, ".sponzey", "global-enrollments.json");
}

function validateDocument(document) {
  if (document?.schemaVersion !== GLOBAL_SKILL_ENROLLMENT_SCHEMA_VERSION) {
    return failure({
      code: "global-enrollment-unsupported-version",
      severity: "warning",
      message: "Global enrollment metadata schema version is unsupported.",
    });
  }
  if (!Array.isArray(document.enrollments)) {
    return failure({
      code: "global-enrollment-invalid",
      message: "Global enrollment metadata is missing enrollments.",
    });
  }

  const enrollments = [];
  for (const enrollment of document.enrollments) {
    const result = createGlobalSkillEnrollment(enrollment ?? {});
    if (!result.ok) {
      return failure({
        code: "global-enrollment-invalid",
        message: "Global enrollment metadata contains an invalid enrollment.",
      });
    }
    enrollments.push(result.value);
  }

  return { ok: true, enrollments };
}

function serializeEnrollment(enrollment) {
  return {
    sourceSkillId: enrollment.sourceSkillId,
    defaultApplyMode: enrollment.defaultApplyMode,
    lifecycle: enrollment.lifecycle,
    placements: enrollment.placements.map(serializePlacement),
    remainingCleanupPlacements: enrollment.remainingCleanupPlacements.map(
      serializePlacement,
    ),
  };
}

function serializePlacement(placement) {
  return { targetId: placement.targetId, applyMode: placement.applyMode };
}

function failure({ code, severity = "error", message }) {
  return {
    ok: false,
    error: { code, severity, category: "repository", message },
  };
}
