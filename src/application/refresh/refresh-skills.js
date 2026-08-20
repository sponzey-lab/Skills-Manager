import {
  buildRepositoryIndex,
  calculateSyncStatus,
  evaluateSkillNameConflictPolicy,
  evaluateSkillShadowingPolicy,
  normalizePath,
} from "../../domain/index.js";
import { transitionTargetScan } from "./target-scan-state-machine.js";

export async function refreshSkills({
  context,
  skillRepository,
  targetStore,
  hashPort = null,
  analysisStore = null,
  repositoryIndexStore = null,
  versionControlPort = null,
  now = () => new Date().toISOString(),
}) {
  const steps = ["LoadingSources"];
  const sourceResult = await skillRepository.scanSourceSkills({
    repositoryPath: context.mainRepositoryPath,
  });

  if (!sourceResult.ok) {
    return refreshFailed({
      diagnostics: [sourceResult.error],
      steps: [...steps, "SourceScanFailed"],
    });
  }

  const sources = [...sourceResult.sources].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const hashingEnabled = typeof hashPort?.hashDirectory === "function";
  if (hashingEnabled) {
    steps.push("HashingSources");
  }
  const sourceHashByPath = await loadSourceHashes({ sources, hashPort });
  const checkedAt = now();
  const repositoryIndexResult = await loadRepositoryIndex({
    repositoryPath: context.mainRepositoryPath,
    sources,
    repositoryIndexStore,
    sourceHashByPath,
    indexedAt: checkedAt,
  });
  if (repositoryIndexResult.available) {
    steps.push("ReadingRepositoryIndex");
  }
  if (repositoryIndexResult.writeAttempted) {
    steps.push("WritingRepositoryIndex");
  }
  const repositoryVersionResult = await loadRepositoryVersion({
    repositoryPath: context.mainRepositoryPath,
    versionControlPort,
    checkedAt,
  });
  if (repositoryVersionResult.available) {
    steps.push("CheckingVersionStatus");
  }
  const indexedSources = applyRepositoryIndexToSources({
    sources,
    repositoryIndexResult,
  });
  const analysisMetadataResult = await loadAnalysisMetadata({
    repositoryPath: context.mainRepositoryPath,
    sources: indexedSources,
    analysisStore,
    sourceHashByPath,
  });
  if (analysisMetadataResult.available) {
    steps.push("LoadingAnalysisMetadata");
  }
  const sourceByPath = new Map(
    indexedSources.map((source) => [normalizePath(source.sourcePath), source]),
  );
  const mainRepositorySkills = indexedSources.map((source) =>
    mapSourceToMainRepositorySkill({
      source,
      sourceHashByPath,
      analysisMetadataResult,
    }),
  );
  const mainSkillById = new Map(
    mainRepositorySkills.map((skill) => [skill.id, skill]),
  );
  const backupsResult = await loadBackups({
    repositoryPath: context.mainRepositoryPath,
    skillRepository,
  });

  steps.push("LoadingTargets");
  const targets = [...context.globalTargets, ...context.projectTargets];
  const globalSkills = [];
  const projectSkills = [];
  const diagnostics = [
    ...repositoryIndexResult.diagnostics,
    ...repositoryVersionResult.diagnostics,
    ...analysisMetadataResult.diagnostics,
    ...backupsResult.diagnostics,
  ];
  const events = [];
  let appliedSkillCount = 0;
  let unavailableTargetCount = 0;

  for (const target of targets) {
    const targetResult = await scanTarget({
      target,
      targetStore,
      knownSourcePaths: indexedSources.map((source) => source.sourcePath),
    });

    const targetDiagnostics = targetResult.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      targetId: target.id,
      targetPath: normalizePath(target.targetPath),
    }));
    diagnostics.push(...targetDiagnostics);
    if (targetResult.state === "TargetUnavailable") {
      unavailableTargetCount += 1;
    }

    const mappedSkills = await Promise.all(
      targetResult.appliedSkills.map((appliedSkill) =>
        mapAppliedSkill({
          appliedSkill,
          target,
          sourceByPath,
          mainSkillById,
          sourceHashByPath,
          hashPort,
        }),
      ),
    );
    const skills = mappedSkills.map((result) => result.skill);
    diagnostics.push(
      ...mappedSkills.flatMap((result) =>
        result.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          targetId: target.id,
          targetPath: normalizePath(target.targetPath),
        })),
      ),
    );

    const group = buildTargetSkillGroup({ target, skills });

    appliedSkillCount += group.skills.length;
    events.push({
      level: "FieldDebugLog",
      code:
        targetResult.state === "TargetUnavailable"
          ? "target.scan.unavailable"
          : "target.scan.completed",
      targetId: target.id,
      scope: target.scope,
      state: targetResult.state,
      appliedSkillCount: group.skills.length,
      diagnosticCount: targetDiagnostics.length,
    });

    if (target.scope === "project") {
      projectSkills.push(group);
    } else {
      globalSkills.push(group);
    }
  }

  if (unavailableTargetCount > 0) {
    steps.push("TargetsPartiallyAvailable");
  }

  const duplicateTargetDiagnostics = detectDuplicateTargetSkills([
    ...globalSkills,
    ...projectSkills,
  ]);
  if (duplicateTargetDiagnostics.length > 0) {
    steps.push("DetectingTargetDuplicates");
    diagnostics.push(...duplicateTargetDiagnostics);
  }

  const conflictResult = evaluateSkillNameConflictPolicy({
    sourceSkills: mainRepositorySkills,
    appliedSkillGroups: [...globalSkills, ...projectSkills],
  });
  if (conflictResult.diagnostics.length > 0) {
    steps.push("DetectingConflicts");
    diagnostics.push(...conflictResult.diagnostics);
  }

  if (globalSkills.length > 0 && projectSkills.length > 0) {
    steps.push("DetectingShadowing");
    const shadowingResult = evaluateSkillShadowingPolicy({
      globalSkillGroups: globalSkills,
      projectSkillGroups: projectSkills,
    });
    diagnostics.push(...shadowingResult.diagnostics);
  }

  steps.push("MatchingSources");
  steps.push("CalculatingReadModel");

  events.push({
    level: "ProductLog",
    code: "skills.refresh.completed",
    sourceCount: mainRepositorySkills.length,
    targetCount: targets.length,
    appliedSkillCount,
    diagnosticCount: diagnostics.length,
  });

  const readModel = {
    mainRepositorySkills,
    globalSkills: aggregateTargetSkillGroups({ groups: globalSkills }),
    projectSkills: aggregateTargetSkillGroups({ groups: projectSkills }),
    targetGroups: [...globalSkills, ...projectSkills],
    diagnostics,
  };

  if (repositoryVersionResult.available) {
    readModel.repositoryVersion = repositoryVersionResult.repositoryVersion;
  }

  if (backupsResult.available) {
    readModel.backups = backupsResult.backups;
  }

  return {
    ok: true,
    readModel,
    events,
    steps: [...steps, "Completed"],
  };
}

/**
 * Converts an already-scanned target and its mapped placements into the
 * application read-model boundary. It performs no I/O and preserves optional
 * target metadata so later aggregation can replace grouping without changing
 * target-specific operations.
 */
export function buildTargetSkillGroup({ target, skills }) {
  const group = {
    targetId: target.id,
    clientType: target.clientType,
    scope: target.scope,
    targetPath: normalizePath(target.targetPath),
    skills,
  };

  if (target.origin !== undefined) {
    group.origin = target.origin;
  }

  if (target.capabilities !== undefined) {
    group.capabilities = target.capabilities;
  }

  if (target.workspacePath !== undefined) {
    group.workspacePath = normalizePath(target.workspacePath);
  }

  if (target.targetPattern !== undefined) {
    group.targetPattern = target.targetPattern;
  }

  return group;
}

/**
 * Converts target-local scan groups into display rows without losing the
 * placement DTO required by target-specific commands. Managed rows are keyed
 * only by stable source identity; unresolved/external rows remain distinct
 * until a content-hash identity is available.
 */
export function aggregateTargetSkillGroups({ groups }) {
  const rowsByIdentity = new Map();
  let unresolvedIndex = 0;
  for (const group of groups ?? []) {
    for (const skill of group.skills ?? []) {
      if (skill.kind === "broken-symlink") {
        continue;
      }
      const identity = managedKind(skill.kind) && skill.sourceId
        ? `managed:${skill.sourceId}`
        : typeof skill.contentHash === "string" && skill.contentHash.length > 0
          ? `external:${normalizeExternalName(skill.name)}:${skill.contentHash}`
          : `unresolved:${unresolvedIndex++}`;
      const placement = {
        targetId: group.targetId,
        clientType: group.clientType,
        scope: group.scope,
        targetPath: group.targetPath,
        appliedSkill: skill,
      };
      if (group.workspacePath !== undefined) placement.workspacePath = group.workspacePath;
      if (group.targetPattern !== undefined) placement.targetPattern = group.targetPattern;
      if (group.origin !== undefined) placement.origin = group.origin;
      if (group.capabilities !== undefined) placement.capabilities = group.capabilities;
      const existing = rowsByIdentity.get(identity);
      if (existing) {
        existing.placements.push(placement);
        continue;
      }
      rowsByIdentity.set(identity, {
        id: identity,
        name: skill.name,
        kind: managedKind(skill.kind) && skill.sourceId ? "managed" : "external",
        status: managedKind(skill.kind) && skill.sourceId ? "managed" : skill.status,
        sourceId: skill.sourceId ?? null,
        clientBadges: [],
        placements: [placement],
      });
    }
  }
  return [...rowsByIdentity.values()]
    .map((row) => ({
      ...row,
      clientBadges: [...new Set(row.placements.map((placement) => placement.clientType).filter(Boolean))].sort(),
      placements: [...row.placements].sort((left, right) =>
        `${left.clientType}:${left.targetId}:${left.appliedSkill.targetPath}`.localeCompare(
          `${right.clientType}:${right.targetId}:${right.appliedSkill.targetPath}`,
        ),
      ),
    }))
    .sort((left, right) => `${left.name}:${left.id}`.localeCompare(`${right.name}:${right.id}`));
}

function normalizeExternalName(name) {
  return typeof name === "string" ? name.trim().toLocaleLowerCase() : "unnamed";
}

function detectDuplicateTargetSkills(groups) {
  const firstTargetBySkill = new Map();
  const diagnostics = [];

  for (const group of groups) {
    for (const skill of group.skills ?? []) {
      const key = `${group.clientType}:${group.scope}:${skill.name}`;
      const firstTarget = firstTargetBySkill.get(key);
      if (!firstTarget) {
        firstTargetBySkill.set(key, group);
        continue;
      }

      diagnostics.push({
        code: "duplicate-target-skill",
        severity: "warning",
        category: "conflict",
        riskLevel: "low",
        message:
          "The same skill name exists in more than one target for this client.",
        recommendation:
          "Review both target locations and keep the intended skill before applying or removing anything.",
        skillName: skill.name,
        clientType: group.clientType,
        scope: group.scope,
        targetId: group.targetId,
        targetPath: group.targetPath,
        conflictingTargetId: firstTarget.targetId,
      });
    }
  }

  return diagnostics;
}

async function scanTarget({ target, targetStore, knownSourcePaths }) {
  let state = transitionTargetScan("Idle", "Validate").state;
  if (!hasText(target?.targetPath)) {
    state = transitionTargetScan(state, "TargetInvalid").state;
    return {
      state,
      appliedSkills: [],
      diagnostics: [targetUnavailableDiagnostic()],
    };
  }

  state = transitionTargetScan(state, "TargetValid").state;
  const result = await targetStore.scanAppliedSkills({
    targetPath: target.targetPath,
    knownSourcePaths,
  });

  if (!result.ok) {
    state = transitionTargetScan(state, "TargetFailed").state;
    return {
      state,
      appliedSkills: [],
      diagnostics: [
        targetUnavailableDiagnostic({
          cause: result.error?.code,
        }),
      ],
    };
  }

  const diagnostics = result.diagnostics ?? [];
  state = transitionTargetScan(
    state,
    diagnostics.length > 0 ? "DiagnosticsFound" : "ScanCompleted",
  ).state;
  return {
    state,
    appliedSkills: result.appliedSkills ?? [],
    diagnostics,
  };
}

function targetUnavailableDiagnostic({ cause } = {}) {
  return {
    code: "target-unavailable",
    severity: "warning",
    category: "target",
    riskLevel: "low",
    message: "Existing skills could not be read from this target.",
    recommendation:
      "Check that the target exists and is readable, then refresh the skills view.",
    ...(cause ? { cause } : {}),
  };
}

function mapSourceToMainRepositorySkill({
  source,
  sourceHashByPath,
  analysisMetadataResult,
}) {
  const normalizedSourcePath = normalizePath(source.sourcePath);
  const analysis = analysisMetadataResult.analysisBySourceId.get(source.id);
  const analysisStatus =
    analysis?.analysisStatus ??
    analysisMetadataResult.analysisStatusBySourceId.get(source.id);
  const skill = createMainRepositorySkillReadModel({
    source,
    normalizedSourcePath,
    sourceHash: sourceHashByPath.get(normalizedSourcePath),
  });

  applySourceScanSummary({ skill, source });
  applyAnalysisSummary({ skill, analysis, analysisStatus });

  return skill;
}

function createMainRepositorySkillReadModel({
  source,
  normalizedSourcePath,
  sourceHash,
}) {
  const skill = {
    id: source.id,
    name: source.name,
    sourcePath: normalizedSourcePath,
    status: "inactive",
    appliedTargets: [],
  };

  if (sourceHash) {
    skill.sourceHash = sourceHash;
  }
  if (source.sourceId !== undefined) {
    skill.sourceId = source.sourceId;
  }
  if (source.origin !== undefined) {
    skill.origin = source.origin;
  }
  if (source.indexStatus !== undefined) {
    skill.indexStatus = source.indexStatus;
  }
  if (source.lastIndexedAt !== undefined) {
    skill.lastIndexedAt = source.lastIndexedAt;
  }

  return skill;
}

function applySourceScanSummary({ skill, source }) {
  if (source.riskLevel) {
    skill.riskLevel = source.riskLevel;
  }
  if (source.lastAnalyzedAt) {
    skill.lastAnalyzedAt = source.lastAnalyzedAt;
  }
}

function applyAnalysisSummary({ skill, analysis, analysisStatus }) {
  if (analysis) {
    skill.riskLevel = analysis.riskLevel;
    skill.lastAnalyzedAt = analysis.lastAnalyzedAt;
    skill.analysisStatus = analysis.analysisStatus;
    skill.diagnostics = analysis.diagnostics;
    if (analysis.findings) skill.findings = analysis.findings;
    if (analysis.riskDecision) skill.riskDecision = analysis.riskDecision;
    if (analysis.coverage) skill.analysisCoverage = analysis.coverage;
    skill.dependencies = analysis.dependencies;
    skill.compatibility = analysis.compatibility;
    if (analysis.analysisStatus === "stale") {
      skill.lastAnalyzedSourceHash = analysis.lastAnalyzedSourceHash;
    }
    return;
  }

  if (analysisStatus) {
    skill.analysisStatus = analysisStatus;
  }
}

async function loadBackups({ repositoryPath, skillRepository }) {
  if (typeof skillRepository?.scanBackups !== "function") {
    return {
      available: false,
      backups: [],
      diagnostics: [],
    };
  }

  const result = await skillRepository.scanBackups({ repositoryPath });
  if (!result.ok) {
    return {
      available: true,
      backups: [],
      diagnostics: [result.error],
    };
  }

  return {
    available: true,
    backups: [...(result.backups ?? [])].sort((left, right) =>
      `${left.skillName ?? ""}:${left.snapshotId ?? ""}`.localeCompare(
        `${right.skillName ?? ""}:${right.snapshotId ?? ""}`,
      ),
    ),
    diagnostics: result.diagnostics ?? [],
  };
}

async function loadAnalysisMetadata({
  repositoryPath,
  sources,
  analysisStore,
  sourceHashByPath,
}) {
  const analysisBySourceId = new Map();
  const analysisStatusBySourceId = new Map();
  const diagnostics = [];

  if (typeof analysisStore?.readAnalysisMetadata !== "function") {
    return {
      available: false,
      analysisBySourceId,
      analysisStatusBySourceId,
      diagnostics,
    };
  }

  for (const source of sources) {
    const result = await analysisStore.readAnalysisMetadata({
      repositoryPath,
      skillId: source.id,
    });

    if (result.ok) {
      const currentSourceHash = sourceHashByPath.get(
        normalizePath(source.sourcePath),
      );
      const analysisStatus = analysisStatusForMetadata({
        metadata: result.metadata,
        currentSourceHash,
      });
      const sourceDiagnostics = (result.metadata.findings ?? result.metadata.diagnostics ?? []).map(
        (diagnostic) => diagnosticWithSource({ diagnostic, source }),
      );

      analysisBySourceId.set(source.id, {
        riskLevel: result.metadata.riskLevel,
        lastAnalyzedAt: result.metadata.analyzedAt,
        lastAnalyzedSourceHash: result.metadata.sourceHash,
        analysisStatus,
        diagnostics: sourceDiagnostics,
        ...(Array.isArray(result.metadata.findings)
          ? { findings: sourceDiagnostics }
          : {}),
        riskDecision: result.metadata.riskDecision,
        coverage: result.metadata.coverage,
        dependencies: [...(result.metadata.dependencies ?? [])],
        compatibility: { ...(result.metadata.compatibility ?? {}) },
      });
      diagnostics.push(...sourceDiagnostics);
      continue;
    }

    analysisStatusBySourceId.set(
      source.id,
      result.error?.code === "analysis-metadata-stale-version" ? "stale" : "unknown",
    );
    if (result.error?.code !== "analysis-metadata-not-found") {
      diagnostics.push(
        diagnosticWithSource({
          diagnostic: result.error,
          source,
        }),
      );
    }
  }

  return {
    available: true,
    analysisBySourceId,
    analysisStatusBySourceId,
    diagnostics,
  };
}

async function loadRepositoryVersion({
  repositoryPath,
  versionControlPort,
  checkedAt,
}) {
  if (typeof versionControlPort?.getRepositoryStatus !== "function") {
    return {
      available: false,
      repositoryVersion: null,
      diagnostics: [],
    };
  }

  const result = await versionControlPort.getRepositoryStatus({
    repositoryPath,
  });
  if (!result.ok) {
    return {
      available: true,
      repositoryVersion: summarizeRepositoryVersion({
        status: statusForVersionError(result.error),
        entries: [],
        checkedAt,
      }),
      diagnostics: [result.error],
    };
  }

  return {
    available: true,
    repositoryVersion: summarizeRepositoryVersion({
      status: result.status,
      entries: result.entries ?? [],
      checkedAt: result.checkedAt ?? checkedAt,
    }),
    diagnostics: [],
  };
}

function summarizeRepositoryVersion({ status, entries, checkedAt }) {
  return {
    status: status ?? (entries.length > 0 ? "dirty" : "clean"),
    changedFileCount: entries.length,
    sourceChangeCount: countVersionEntriesWithPrefix(entries, "skills/"),
    backupChangeCount: countVersionEntriesWithPrefix(entries, "backups/"),
    metadataChangeCount: countMetadataVersionEntries(entries),
    lastCheckedAt: checkedAt,
  };
}

function statusForVersionError(error) {
  return error?.code === "not-git-repository"
    ? "not-git-repository"
    : "unavailable";
}

function countVersionEntriesWithPrefix(entries, prefix) {
  return entries.filter((entry) => versionEntryPath(entry).startsWith(prefix))
    .length;
}

function countMetadataVersionEntries(entries) {
  return entries.filter((entry) => {
    const entryPath = versionEntryPath(entry);
    return entryPath === ".sponzey" || entryPath.startsWith(".sponzey/");
  }).length;
}

function versionEntryPath(entry) {
  return normalizePath(entry?.path ?? "").replace(/^\/+/, "");
}

async function loadRepositoryIndex({
  repositoryPath,
  sources,
  repositoryIndexStore,
  sourceHashByPath,
  indexedAt,
}) {
  const entryByPath = new Map();
  const diagnostics = [];

  if (
    typeof repositoryIndexStore?.readRepositoryIndex !== "function" ||
    typeof repositoryIndexStore?.writeRepositoryIndex !== "function"
  ) {
    return {
      available: false,
      writeAttempted: false,
      entryByPath,
      diagnostics,
    };
  }

  const readResult = await repositoryIndexStore.readRepositoryIndex({
    repositoryPath,
  });
  if (!readResult.ok) {
    diagnostics.push(readResult.error);
    for (const source of sources) {
      entryByPath.set(normalizePath(source.sourcePath), {
        sourceId: source.id,
        indexStatus: "unknown",
      });
    }
    return {
      available: true,
      writeAttempted: false,
      entryByPath,
      diagnostics,
    };
  }

  const repositoryIndex = buildRepositoryIndex({
    sources,
    existingIndex: readResult.index,
    sourceHashByPath,
    indexedAt,
  });

  for (const entry of repositoryIndex.entries) {
    entryByPath.set(normalizePath(entry.sourcePath), entry);
  }

  const writeResult = await repositoryIndexStore.writeRepositoryIndex({
    repositoryPath,
    index: repositoryIndex.index,
  });
  if (!writeResult.ok) {
    diagnostics.push(writeResult.error);
  }

  return {
    available: true,
    writeAttempted: true,
    entryByPath,
    diagnostics,
  };
}

function applyRepositoryIndexToSources({ sources, repositoryIndexResult }) {
  if (!repositoryIndexResult.available) {
    return sources;
  }

  return sources.map((source) => {
    const entry = repositoryIndexResult.entryByPath.get(
      normalizePath(source.sourcePath),
    );
    if (!entry) {
      return {
        ...source,
        indexStatus: "unknown",
      };
    }

    return {
      ...source,
      id: entry.sourceId ?? source.id,
      sourceId: entry.sourceId ?? source.id,
      origin: entry.origin,
      indexStatus: entry.indexStatus ?? "indexed",
      lastIndexedAt: entry.indexedAt,
    };
  });
}

function analysisStatusForMetadata({ metadata, currentSourceHash }) {
  if (!currentSourceHash || !metadata?.sourceHash) {
    return "unknown";
  }

  return currentSourceHash === metadata.sourceHash ? "current" : "stale";
}

function diagnosticWithSource({ diagnostic, source }) {
  return {
    ...diagnostic,
    sourceId: diagnostic.sourceId ?? source.id,
    skillName: diagnostic.skillName ?? source.name,
  };
}

async function mapAppliedSkill({
  appliedSkill,
  target,
  sourceByPath,
  mainSkillById,
  sourceHashByPath,
  hashPort,
}) {
  const sourcePath = sourcePathForAppliedSkill(appliedSkill);
  const source = sourcePath ? sourceByPath.get(normalizePath(sourcePath)) : null;
  const sourceId = source?.id ?? null;
  const syncEnabled = typeof hashPort?.hashDirectory === "function";
  const normalizedSourcePath = sourcePath ? normalizePath(sourcePath) : null;
  const currentSourceHash = normalizedSourcePath
    ? sourceHashByPath.get(normalizedSourcePath) ?? null
    : null;
  const currentTargetHash = await hashAppliedTarget({ appliedSkill, hashPort });
  const externalContentHash = await hashExternalTarget({ target, appliedSkill, hashPort });

  if (sourceId && managedKind(appliedSkill.kind)) {
    const mainSkill = mainSkillById.get(sourceId);
    if (mainSkill) {
      const appliedTarget = {
        targetId: target.id,
        kind: appliedSkill.kind,
      };
      if (syncEnabled) {
        appliedTarget.syncStatus = calculateSyncStatus({
          kind: appliedSkill.kind,
          sourceExists: Boolean(sourceId),
          targetExists: true,
          sourceHash: appliedSkill.metadata?.sourceHash,
          targetHash: appliedSkill.metadata?.targetHash,
          currentSourceHash,
          currentTargetHash,
        });
      }
      mainSkill.status = "applied";
      mainSkill.appliedTargets.push(appliedTarget);
    }
  }

  const mapped = {
    name: appliedSkill.name,
    kind: appliedSkill.kind,
    status: appliedStatus({ appliedSkill, sourceId }),
    targetPath: normalizePath(appliedSkill.targetPath),
    sourceId,
  };

  if (syncEnabled) {
    mapped.syncStatus = calculateSyncStatus({
      kind: appliedSkill.kind,
      sourceExists: Boolean(sourceId) || !managedKind(appliedSkill.kind),
      targetExists: true,
      sourceHash: appliedSkill.metadata?.sourceHash,
      targetHash: appliedSkill.metadata?.targetHash,
      currentSourceHash,
      currentTargetHash,
    });
    mapped.sourceHash = currentSourceHash;
    mapped.targetHash = currentTargetHash;
    mapped.lastCheckedAt = null;
  }
  if (externalContentHash.hash) {
    mapped.contentHash = externalContentHash.hash;
  }

  return {
    skill: mapped,
    diagnostics: externalContentHash.diagnostic ? [externalContentHash.diagnostic] : [],
  };
}

async function hashExternalTarget({ target, appliedSkill, hashPort }) {
  if (
    managedKind(appliedSkill.kind) ||
    appliedSkill.kind === "broken-symlink" ||
    typeof hashPort?.hashDirectoryWithinRoot !== "function"
  ) {
    return { hash: null, diagnostic: null };
  }
  const hashResult = await hashPort.hashDirectoryWithinRoot({
    rootPath: target.targetPath,
    directoryPath: appliedSkill.targetPath,
  });
  if (hashResult.ok) {
    return { hash: hashResult.hash, diagnostic: null };
  }
  return {
    hash: null,
    diagnostic: {
      code: "external-content-hash-unavailable",
      severity: "warning",
      category: "target",
      cause: hashResult.error?.code,
      message: "External target content could not be hashed and was kept separate.",
      recommendation: "Check that the target skill is readable and remains inside its target root.",
      skillName: appliedSkill.name,
    },
  };
}

async function loadSourceHashes({ sources, hashPort }) {
  const sourceHashByPath = new Map();

  if (typeof hashPort?.hashDirectory !== "function") {
    return sourceHashByPath;
  }

  for (const source of sources) {
    const hashResult = await hashPort.hashDirectory({
      directoryPath: source.sourcePath,
    });
    if (hashResult.ok) {
      sourceHashByPath.set(normalizePath(source.sourcePath), hashResult.hash);
    }
  }

  return sourceHashByPath;
}

async function hashAppliedTarget({ appliedSkill, hashPort }) {
  if (
    appliedSkill.kind !== "managed-copy" ||
    typeof hashPort?.hashDirectory !== "function"
  ) {
    return null;
  }

  const hashResult = await hashPort.hashDirectory({
    directoryPath: appliedSkill.targetPath,
  });

  return hashResult.ok ? hashResult.hash : null;
}

function sourcePathForAppliedSkill(appliedSkill) {
  if (appliedSkill.sourcePath) {
    return appliedSkill.sourcePath;
  }

  if (appliedSkill.metadata?.sourcePath) {
    return appliedSkill.metadata.sourcePath;
  }

  return null;
}

function appliedStatus({ appliedSkill, sourceId }) {
  if (appliedSkill.kind === "broken-symlink") {
    return "broken";
  }

  if (appliedSkill.kind === "invalid-managed-copy") {
    return "invalid";
  }

  if (managedKind(appliedSkill.kind) && sourceId) {
    return "managed";
  }

  return "external";
}

function managedKind(kind) {
  return kind === "managed-symlink" || kind === "managed-copy";
}

function refreshFailed({ diagnostics, steps }) {
  return {
    ok: false,
    readModel: null,
    diagnostics,
    events: [
      {
        level: "ProductLog",
        code: "skills.refresh.failed",
        diagnosticCount: diagnostics.length,
      },
    ],
    steps,
  };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
