import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizePath } from "../../domain/index.js";

const ANALYSIS_SCHEMA_VERSION = 2;

export class FileSystemAnalysisStore {
  async writeAnalysisMetadata({ repositoryPath, metadata }) {
    const validation = validateAnalysisMetadata(metadata);
    if (!validation.ok) {
      return validation;
    }

    try {
      const analysisDirectory = path.join(repositoryPath, ".sponzey", "analysis");
      await mkdir(analysisDirectory, { recursive: true });
      const metadataPath = path.join(
        analysisDirectory,
        `${encodeMetadataFileName(metadata.skillId)}.json`,
      );
      const temporaryPath = `${metadataPath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`);
      await rename(temporaryPath, metadataPath);

      return {
        ok: true,
        metadataPath: normalizePath(metadataPath),
      };
    } catch {
      return metadataWriteFailed();
    }
  }

  async readAnalysisMetadata({ repositoryPath, skillId }) {
    try {
      const metadataPath = path.join(
        repositoryPath,
        ".sponzey",
        "analysis",
        `${encodeMetadataFileName(skillId)}.json`,
      );
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      if (metadata?.schemaVersion === 1) {
        return staleMetadataVersion();
      }
      const validation = validateAnalysisMetadata(metadata);
      if (!validation.ok) {
        return validation;
      }

      return {
        ok: true,
        metadata,
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          ok: false,
          error: {
            code: "analysis-metadata-not-found",
            severity: "warning",
            message: "Analysis metadata was not found.",
          },
        };
      }

      return {
        ok: false,
        error: {
          code: "analysis-metadata-read-failed",
          severity: "error",
          message: "Analysis metadata could not be read.",
        },
      };
    }
  }
}

function validateAnalysisMetadata(metadata) {
  if (
    metadata?.schemaVersion !== ANALYSIS_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      error: {
        code: "analysis-metadata-unsupported-version",
        severity: "warning",
        category: "analysis",
        message: "Analysis metadata schema version is unsupported.",
        recommendation: "Run Analyze All Skills again.",
      },
    };
  }

  const requiredFieldsPresent =
    metadata?.schemaVersion === ANALYSIS_SCHEMA_VERSION &&
    hasText(metadata?.skillId) &&
    hasText(metadata?.sourceHash) &&
    hasText(metadata?.analyzedAt) &&
    hasText(metadata?.riskLevel) &&
    hasText(metadata?.rulePackVersion) &&
    metadata?.riskDecision &&
    typeof metadata.riskDecision === "object" &&
    Array.isArray(metadata?.findings) &&
    metadata?.coverage &&
    typeof metadata.coverage === "object" &&
    Array.isArray(metadata?.diagnostics) &&
    Array.isArray(metadata?.dependencies) &&
    metadata?.compatibility &&
    typeof metadata.compatibility === "object";

  if (!requiredFieldsPresent) {
    return {
      ok: false,
      error: {
        code: "analysis-metadata-invalid",
        severity: "error",
        message: "Analysis metadata is missing required fields.",
      },
    };
  }

  return { ok: true };
}

function staleMetadataVersion() {
  return {
    ok: false,
    error: {
      code: "analysis-metadata-stale-version",
      severity: "warning",
      category: "analysis",
      message: "Analysis metadata must be regenerated with the current analyzer schema.",
      recommendation: "Run Analyze All Skills again.",
    },
  };
}

function encodeMetadataFileName(skillId) {
  return Buffer.from(String(skillId), "utf8").toString("base64url");
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function metadataWriteFailed() {
  return {
    ok: false,
    error: {
      code: "analysis-metadata-write-failed",
      severity: "error",
      message: "Analysis metadata could not be written.",
    },
  };
}
