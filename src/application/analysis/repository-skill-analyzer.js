import { analyzeSkillDirectory } from "./analyze-skill-directory.js";

export function createRepositorySkillAnalyzer({ skillRepository }) {
  return Object.freeze({
    async analyzeSourceSkill({ source }) {
      return analyzeRepositorySourceSkill({ skillRepository, source });
    },
    async analyzeImportedSkill({ source }) {
      return analyzeRepositorySourceSkill({ skillRepository, source });
    },
  });
}

async function analyzeRepositorySourceSkill({ skillRepository, source }) {
  if (typeof skillRepository?.readSourceSkillArtifacts === "function") {
    const artifactResult = await skillRepository.readSourceSkillArtifacts({
      sourcePath: source.sourcePath,
    });

    if (!artifactResult.ok) {
      return sourceReadFailed({ diagnostic: artifactResult.error });
    }

    return analyzeSkillDirectory({
      directoryName: source.name,
      artifacts: artifactResult.artifacts,
      coverage: artifactResult.coverage,
    });
  }

  if (typeof skillRepository?.readSourceSkillFiles !== "function") {
    return sourceReadFailed({
      diagnostic: {
        code: "source-file-reader-not-available",
        severity: "critical",
        message: "Source skill files cannot be read by the repository adapter.",
      },
    });
  }

  const readResult = await skillRepository.readSourceSkillFiles({
    sourcePath: source.sourcePath,
  });

  if (!readResult.ok) {
    return sourceReadFailed({ diagnostic: readResult.error });
  }

  return analyzeSkillDirectory({
    directoryName: source.name,
    files: readResult.files,
  });
}

function sourceReadFailed({ diagnostic }) {
  return {
    manifest: {},
    body: "",
    diagnostics: [
      {
        code: diagnostic?.code ?? "source-files-read-failed",
        severity: "critical",
        riskLevel: "critical",
        message:
          diagnostic?.message ?? "Source skill files could not be read.",
      },
    ],
    riskLevel: "critical",
    steps: ["LoadingSkillDirectory", "SourceReadFailed"],
  };
}
