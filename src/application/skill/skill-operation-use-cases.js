import { confirmationRequiredDiagnostic } from "../confirmation/confirmation-diagnostics.js";
import { transitionAnalysisBatch } from "../analysis/analysis-batch-state-machine.js";
import { createAppliedSkillPlacement, createGlobalSkillEnrollment } from "../../domain/index.js";

export async function getSkillDetail({ input, skillRepository, targetStore }) {
  const diagnostic = input?.diagnostic;
  const backup = input?.backup;
  const source = input?.source;
  const appliedSkill = input?.appliedSkill;
  const target = input?.target;

  if (diagnostic) {
    return {
      ok: true,
      detail: diagnosticDetailFromInput({ diagnostic, source, target }),
      diagnostics: [],
      events: [],
      steps: ["ResolvingItem", "MappingDetail", "Completed"],
    };
  }

  if (backup) {
    return {
      ok: true,
      detail: backupDetailFromInput({ backup }),
      diagnostics: [],
      events: [],
      steps: ["ResolvingItem", "MappingDetail", "Completed"],
    };
  }

  if (source) {
    const filesResult = await readSourceFiles({ source, skillRepository });
    if (!filesResult.ok) {
      return failure("skill.detail.failed", filesResult.error, [
        "LoadingSourceDetail",
        "ReadFailed",
      ]);
    }

    return {
      ok: true,
      detail: sourceDetailFromInput({ source, files: filesResult.files }),
      diagnostics: [],
      events: [],
      steps: [
        "ResolvingItem",
        "LoadingRelatedMetadata",
        "MappingDetail",
        "Completed",
      ],
    };
  }

  if (appliedSkill) {
    return {
      ok: true,
      detail: appliedDetailFromInput({ appliedSkill, target }),
      diagnostics: [],
      events: [],
      steps: ["ResolvingItem", "MappingDetail", "Completed"],
    };
  }

  return failure(
    "skill.detail.failed",
    {
      code: "skill-detail-input-required",
      severity: "error",
      message: "Source or applied skill input is required.",
    },
    ["ValidatingInput", "ValidationFailed"],
  );
}

function sourceDetailFromInput({ source, files }) {
  const detail = {
    type: "source",
    id: source.id,
    name: source.name,
    sourcePath: source.sourcePath,
    skillMdPath: `${source.sourcePath}/SKILL.md`,
    riskLevel: source.riskLevel ?? "unknown",
    diagnostics: source.diagnostics ?? [],
    appliedTargetCount: sourceAppliedTargetCount(source),
    files: Object.keys(files).sort(),
  };

  assignIfPresent(detail, "description", source.description);
  assignIfPresent(detail, "analysisStatus", source.analysisStatus);
  assignIfPresent(detail, "lastAnalyzedAt", source.lastAnalyzedAt);
  assignIfPresent(detail, "sourceHash", source.sourceHash);
  assignIfPresent(
    detail,
    "lastAnalyzedSourceHash",
    source.lastAnalyzedSourceHash,
  );
  assignIfPresent(detail, "dependencies", source.dependencies);
  assignIfPresent(detail, "compatibility", source.compatibility);

  return detail;
}

function appliedDetailFromInput({ appliedSkill, target }) {
  const detail = {
    type: "applied",
    name: appliedSkill.name,
    kind: appliedSkill.kind,
    applyMode: applyModeForAppliedSkill(appliedSkill),
    status: appliedSkill.status,
    syncStatus: appliedSkill.syncStatus ?? "Unknown",
    targetPath: appliedSkill.targetPath,
    sourceId: appliedSkill.sourceId ?? null,
    diagnostics: appliedSkill.diagnostics ?? [],
  };

  assignIfPresent(detail, "targetId", target?.id ?? appliedSkill.targetId);
  assignIfPresent(detail, "clientType", target?.clientType);
  assignIfPresent(detail, "scope", target?.scope);
  assignIfPresent(detail, "targetRootPath", target?.targetPath);
  assignIfPresent(detail, "sourceHash", appliedSkill.sourceHash);
  assignIfPresent(detail, "targetHash", appliedSkill.targetHash);
  assignIfPresent(detail, "lastCheckedAt", appliedSkill.lastCheckedAt);

  return detail;
}

function diagnosticDetailFromInput({ diagnostic, source, target }) {
  const detail = {
    type: "diagnostic",
    code: diagnostic.code,
    severity: diagnostic.severity,
    category: diagnostic.category,
    message: diagnostic.message,
    recommendation: diagnostic.recommendation,
    sourceId: diagnostic.sourceId ?? source?.id ?? null,
    targetId: diagnostic.targetId ?? target?.id ?? null,
    relatedCommands: relatedCommandsForDiagnostic({ source, target }),
  };

  assignIfPresent(detail, "sourceName", source?.name);
  assignIfPresent(detail, "targetPath", diagnostic.targetPath ?? target?.targetPath);
  assignIfPresent(detail, "filePath", diagnostic.filePath);
  assignIfPresent(detail, "line", diagnostic.line);

  return detail;
}

function backupDetailFromInput({ backup }) {
  const metadata = backup.metadata ?? {};
  const detail = {
    type: "backup",
    skillName: backup.skillName,
    snapshotId: backup.snapshotId,
    backupPath: backup.backupPath,
    relatedCommands: [
      "sponzeySkills.promoteBackupToSkillSource",
      "sponzeySkills.deleteBackup",
    ],
  };

  assignIfPresent(detail, "createdAt", backup.createdAt);
  assignIfPresent(detail, "sourceHash", backup.sourceHash ?? metadata.sourceHash);
  assignIfPresent(
    detail,
    "promotedStatus",
    backup.promotedStatus ?? metadata.promotedStatus,
  );
  assignIfPresent(detail, "metadata", backup.metadata);
  assignIfPresent(detail, "targetId", backup.targetId ?? metadata.targetId);
  assignIfPresent(detail, "targetPath", backup.targetPath ?? metadata.targetPath);
  assignIfPresent(detail, "clientType", backup.clientType ?? metadata.clientType);
  assignIfPresent(detail, "scope", backup.scope ?? metadata.scope);

  return detail;
}

function applyModeForAppliedSkill(appliedSkill) {
  if (appliedSkill.metadata?.applyMode) {
    return appliedSkill.metadata.applyMode;
  }

  if (appliedSkill.kind === "managed-copy") {
    return "copy";
  }

  if (appliedSkill.kind === "managed-symlink") {
    return "symlink";
  }

  if (appliedSkill.kind === "external") {
    return "external";
  }

  return "unknown";
}

function relatedCommandsForDiagnostic({ source, target }) {
  const commands = [];

  if (source?.sourcePath) {
    commands.push("sponzeySkills.openSkillMd");
    commands.push("sponzeySkills.showSkillDetail");
  } else if (target?.targetPath) {
    commands.push("sponzeySkills.openTargetFolder");
  }

  return commands;
}

function assignIfPresent(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
}

export async function openSkillPath({ input, repositoryOpener }) {
  const path = pathForOpenInput(input);
  if (!path) {
    return failure(
      "skill.open.failed",
      {
        code: "skill-open-path-required",
        severity: "error",
        message: "A source, applied skill, or explicit path is required.",
      },
      ["ValidatingInput", "ValidationFailed"],
    );
  }

  if (typeof repositoryOpener?.openPath !== "function") {
    return failure(
      "skill.open.failed",
      {
        code: "repository-opener-unavailable",
        severity: "error",
        message: "Repository opener is unavailable.",
      },
      ["ValidatingInput", "RepositoryOpenerUnavailable"],
    );
  }

  const openResult = await repositoryOpener.openPath({
    path,
    openMode: input?.openKind === "skillMd" ? "editor" : "external",
  });
  if (!openResult.ok) {
    return failure("skill.open.failed", openResult.error, [
      "ValidatingInput",
      "OpenFailed",
    ]);
  }

  return {
    ok: true,
    openedPath: path,
    diagnostics: [],
    events: [],
    steps: ["ValidatingInput", "OpeningTarget", "Completed"],
  };
}

export async function analyzeAllSkills({
  context,
  analyzer,
  skillRepository,
  analysisStore = null,
  hashPort = null,
  cancellation = null,
  clock = () => new Date().toISOString(),
}) {
  const sourceResult = await skillRepository.scanSourceSkills({
    repositoryPath: context.mainRepositoryPath,
  });

  if (!sourceResult.ok) {
    return failure("skill.analysis.failed", sourceResult.error, [
      "LoadingSources",
      "SourceScanFailed",
    ]);
  }

  const summaries = [];
  const diagnostics = [];
  const events = [];
  const metadataWriteEnabled =
    typeof analysisStore?.writeAnalysisMetadata === "function";
  const hashingEnabled = typeof hashPort?.hashDirectory === "function";
  let batchState = transitionAnalysisBatch("Idle", "Start").state;
  batchState = transitionAnalysisBatch(batchState, "SourcesFound").state;

  for (const source of sourceResult.sources) {
    if (cancellation?.isCancelled?.()) {
      return completedAnalysisBatch({ summaries, diagnostics, events, state: "Cancelled", cancelled: true, hashingEnabled, metadataWriteEnabled });
    }
    let sourceHash;
    let analysis;
    try {
      sourceHash = hashingEnabled ? await hashSourceForAnalysis({ source, hashPort }) : null;
      analysis = await analyzer.analyzeSourceSkill({ source });
    } catch {
      diagnostics.push({ code: "analysis-source-failed", severity: "error", message: "One skill could not be analyzed.", sourceId: source.id });
      batchState = transitionAnalysisBatch(batchState, "SourceFailed").state;
      continue;
    }
    const sourceDiagnostics = (analysis.diagnostics ?? []).map((diagnostic) => ({
      ...diagnostic,
      sourceId: source.id,
    }));
    summaries.push({
      sourceId: source.id,
      name: source.name,
      riskLevel: analysis.riskLevel,
      diagnosticCount: analysis.diagnostics?.length ?? 0,
      ...(sourceHash ? { sourceHash } : {}),
    });
    diagnostics.push(...sourceDiagnostics);
    batchState = transitionAnalysisBatch(batchState, "SourceCompleted").state;

    if (metadataWriteEnabled && sourceHash) {
      const persistedFindings = sanitizeAnalysisFindings(sourceDiagnostics);
      const writeResult = await analysisStore.writeAnalysisMetadata({
        repositoryPath: context.mainRepositoryPath,
        metadata: {
          schemaVersion: 2,
          analyzerVersion: analyzer?.version ?? "unknown",
          skillId: source.id,
          skillName: source.name,
          sourceHash,
          analyzedAt: clock(),
          riskLevel: analysis.riskLevel,
          diagnostics: persistedFindings,
          findings: persistedFindings,
          rulePackVersion: analysis.policyVersion ?? analyzer?.version ?? "unknown",
          riskDecision: analysis.riskDecision ?? {
            riskLevel: analysis.riskLevel ?? "low",
            enforcement: "allow",
            confidence: "unknown",
            impact: analysis.riskLevel ?? "low",
            reachability: "unknown",
            escalationReason: "legacy-analysis-result",
            correlatedSignalFamilies: [],
          },
          coverage: analysis.coverage ?? {
            scannedFileCount: 0,
            analyzedArtifactCount: 0,
            skipped: [],
          },
          ...(analysis.policyVersion
            ? { policyVersion: analysis.policyVersion }
            : {}),
          ...(policyRuleCodesForAnalysis({ analysis, diagnostics: sourceDiagnostics })
            .length > 0
            ? {
                policyRuleCodes: policyRuleCodesForAnalysis({
                  analysis,
                  diagnostics: sourceDiagnostics,
                }),
              }
            : {}),
          dependencies: analysis.dependencies ?? [],
          compatibility: analysis.compatibility ?? {},
        },
      });

      if (!writeResult.ok) {
        batchState = transitionAnalysisBatch(batchState, "SourceFailed").state;
        diagnostics.push({
          ...(writeResult.error ?? {
            code: "analysis-metadata-write-failed",
            severity: "error",
            message: "Analysis metadata could not be written.",
          }),
          sourceId: source.id,
        });
        events.push({
          level: "ProductLog",
          code: "analysis.metadata.write.failed",
          sourceId: source.id,
          reason: writeResult.error?.code ?? "analysis-metadata-write-failed",
        });
      }
    }
  }

  return completedAnalysisBatch({ summaries, diagnostics, events, state: transitionAnalysisBatch(batchState, "Finish").state, hashingEnabled, metadataWriteEnabled });
}

function completedAnalysisBatch({ summaries, diagnostics, events, state, cancelled = false, hashingEnabled, metadataWriteEnabled }) {
  return {
    ok: true,
    summaries,
    diagnostics,
    cancelled,
    batchState: state,
    events: [...events, { level: "ProductLog", code: cancelled ? "skill.analysis.cancelled" : "skill.analysis.completed", skillCount: summaries.length, diagnosticCount: diagnostics.length }],
    steps: ["LoadingSources", "ReadingSkillFiles", ...(hashingEnabled ? ["HashingSources"] : []), "RunningRules", "AggregatingDiagnostics", ...(metadataWriteEnabled ? ["WritingAnalysisMetadata"] : []), state],
  };
}

async function hashSourceForAnalysis({ source, hashPort }) {
  const result = await hashPort.hashDirectory({
    directoryPath: source.sourcePath,
  });

  return result.ok ? result.hash : null;
}

export async function updateAppliedCopyFromSource({ input, targetStore }) {
  const appliedSkill = input?.appliedSkill;
  const source = input?.source;

  if (!appliedSkill || !source) {
    return failure(
      "skill.apply.blocked",
      {
        code: "update-copy-input-required",
        severity: "error",
        message: "Applied skill and source input are required.",
      },
      ["ValidatingInput", "InvalidInput"],
    );
  }

  if (appliedSkill.kind !== "managed-copy") {
    return failure(
      "skill.apply.blocked",
      {
        code: "update-copy-requires-managed-copy",
        severity: "error",
        message: "Only managed copy targets can be updated from source.",
      },
      ["ValidatingInput", "InvalidInput"],
    );
  }

  if (
    ["Target Changed", "Both Changed"].includes(appliedSkill.syncStatus) &&
    input.confirmationProvided !== true
  ) {
    return failure(
      "skill.apply.blocked",
      confirmationRequiredDiagnostic({
        code: "local-modification-blocked",
        operation: "update-copy-from-source",
        confirmationKey: "confirmationProvided",
        message: "Target local modifications require explicit confirmation.",
      }),
      ["ValidatingInput", "CalculatingSync", "LocalModificationBlocked"],
    );
  }

  if (typeof targetStore?.replaceCopyFromSource !== "function") {
    return failure(
      "skill.apply.blocked",
      {
        code: "target-store-update-unavailable",
        severity: "error",
        message: "Target store cannot update managed copies.",
      },
      ["ValidatingInput", "TargetStoreUnavailable"],
    );
  }

  const writeResult = await targetStore.replaceCopyFromSource({
    sourcePath: source.sourcePath,
    targetPath: appliedSkill.targetPath,
    metadata: {
      sourceSkillId: source.id,
      sourcePath: source.sourcePath,
      applyMode: "copy",
    },
  });

  if (!writeResult.ok) {
    return failure("skill.apply.blocked", writeResult.error, [
      "ValidatingInput",
      "WritingTarget",
      "WriteFailed",
    ]);
  }

  return {
    ok: true,
    updated: {
      skillName: appliedSkill.name,
      targetPath: writeResult.targetPath,
    },
    diagnostics: [],
    events: [
      {
        level: "ProductLog",
        code: "skill.apply.completed",
        skillName: appliedSkill.name,
        operation: "update-copy-from-source",
      },
    ],
    steps: [
      "ValidatingInput",
      "LoadingAppliedSkill",
      "CalculatingSync",
      "WritingTarget",
      "WritingMetadata",
      "VerifyingResult",
      "Completed",
    ],
  };
}

export async function convertAppliedSkillMode({ input, targetStore }) {
  const appliedSkill = input?.appliedSkill;
  const source = input?.source;
  const targetMode = input?.targetMode;

  if (!appliedSkill || !source || !["copy", "symlink"].includes(targetMode)) {
    return failure(
      "skill.apply.blocked",
      {
        code: "conversion-input-required",
        severity: "error",
        message: "Applied skill, source, and target mode are required.",
      },
      ["ValidatingInput", "InvalidInput"],
    );
  }

  if (
    appliedSkill.kind === "managed-copy" &&
    targetMode === "symlink" &&
    ["Target Changed", "Both Changed"].includes(appliedSkill.syncStatus) &&
    input.confirmationProvided !== true
  ) {
    return failure(
      "skill.apply.blocked",
      confirmationRequiredDiagnostic({
        code: "local-modification-blocked",
        operation: "convert-applied-skill-mode",
        confirmationKey: "confirmationProvided",
        message: "Target local modifications require explicit confirmation.",
      }),
      ["ValidatingInput", "CalculatingSync", "LocalModificationBlocked"],
    );
  }

  const methodName =
    targetMode === "copy" ? "convertSymlinkToCopy" : "convertCopyToSymlink";

  if (typeof targetStore?.[methodName] !== "function") {
    return failure(
      "skill.apply.blocked",
      {
        code: "target-store-conversion-unavailable",
        severity: "error",
        message: "Target store cannot convert applied skill mode.",
      },
      ["ValidatingInput", "TargetStoreUnavailable"],
    );
  }

  const result = await targetStore[methodName]({
    sourcePath: source.sourcePath,
    targetPath: appliedSkill.targetPath,
    metadata: {
      sourceSkillId: source.id,
      sourcePath: source.sourcePath,
      applyMode: targetMode,
    },
  });

  if (!result.ok) {
    return failure("skill.apply.blocked", result.error, [
      "ValidatingInput",
      "WritingTarget",
      "WriteFailed",
    ]);
  }

  return {
    ok: true,
    converted: {
      skillName: appliedSkill.name,
      targetPath: result.targetPath,
      applyMode: targetMode,
    },
    diagnostics: [],
    events: [
      {
        level: "ProductLog",
        code: "skill.apply.completed",
        operation: "convert-applied-skill-mode",
        applyMode: targetMode,
      },
    ],
    steps: [
      "ValidatingInput",
      "LoadingAppliedSkill",
      "CalculatingSync",
      "PlanningConversion",
      "WritingTarget",
      "WritingMetadata",
      "VerifyingResult",
      "Completed",
    ],
  };
}

export async function renameSourceSkill({ context, input, skillRepository }) {
  return repositoryMutation({
    eventCode: "skill.source.rename.completed",
    unavailableCode: "source-rename-unavailable",
    methodName: "renameSourceSkill",
    skillRepository,
    input: {
      repositoryPath: context.mainRepositoryPath,
      oldName: input?.oldName ?? input?.source?.name,
      newName: input?.newName,
    },
    steps: ["ValidatingInput", "RenamingSource"],
  });
}

export async function deleteSourceSkill({
  context,
  input,
  skillRepository,
  targetStore,
  enrollmentStore,
}) {
  if (
    sourceAppliedTargetCount(input?.source) > 0 &&
    input?.impactConfirmed !== true
  ) {
    return failure(
      "skill.source.delete.blocked",
      confirmationRequiredDiagnostic({
        code: "source-delete-impact-confirmation-required",
        operation: "source-delete",
        confirmationKey: "impactConfirmed",
        message: "Deleting an applied source requires explicit impact confirmation.",
      }),
      ["ValidatingInput", "ImpactConfirmationRequired"],
    );
  }

  if (input?.confirmationProvided !== true) {
    return failure(
      "skill.source.delete.blocked",
      confirmationRequiredDiagnostic({
        code: "source-delete-confirmation-required",
        operation: "source-delete",
        confirmationKey: "confirmationProvided",
        message: "Source delete requires explicit confirmation.",
      }),
      ["ValidatingInput", "ConfirmationRequired"],
    );
  }

  if (targetStore && input?.cleanupManagedPlacements === true) {
    return deleteSourceAfterManagedPlacementCleanup({
      context,
      input,
      skillRepository,
      targetStore,
      enrollmentStore,
    });
  }
  if (targetStore && input?.cleanupManagedPlacements === false) {
    return deleteSourceOnlyAfterAuthoritativeScan({
      context,
      input,
      skillRepository,
      targetStore,
      enrollmentStore,
    });
  }

  return repositoryMutation({
    eventCode: "skill.source.delete.completed",
    unavailableCode: "source-delete-unavailable",
    methodName: "deleteSourceSkill",
    skillRepository,
    input: {
      repositoryPath: context.mainRepositoryPath,
      skillName: input?.skillName ?? input?.source?.name,
    },
    steps: ["ValidatingInput", "DeletingSource"],
  });
}

async function deleteSourceOnlyAfterAuthoritativeScan({
  context,
  input,
  skillRepository,
  targetStore,
  enrollmentStore,
}) {
  const source = input?.source;
  if (!source?.id || !source?.sourcePath) {
    return failure("skill.source.delete.failed", {
      code: "source-delete-source-only-source-identity-required",
      severity: "error",
      category: "source-delete",
      message: "Source-only deletion requires an identified source.",
    }, ["ValidatingInput", "ValidationFailed"]);
  }
  const discovery = await discoverManagedSourcePlacements({ context, source, targetStore });
  if (!discovery.ok) {
    return failure("skill.source.delete.failed", discovery.error, [
      "LoadingAuthoritativePlacements",
      "TargetScanFailed",
    ]);
  }
  const deleted = await repositoryMutation({
    eventCode: "skill.source.delete.completed",
    unavailableCode: "source-delete-unavailable",
    methodName: "deleteSourceSkill",
    skillRepository,
    input: { repositoryPath: context.mainRepositoryPath, skillName: input?.skillName ?? source.name },
    steps: ["DeletingSource"],
  });
  if (!deleted.ok) {
    return deleted;
  }
  const diagnostics = [...discovery.diagnostics];
  if (enrollmentStore) {
    const enrollmentResult = await disableGlobalEnrollmentForDeletedSource({
      context,
      source,
      enrollmentStore,
    });
    if (!enrollmentResult.ok) {
      diagnostics.push(enrollmentResult.error);
    }
  }
  if (discovery.placements.length > 0) {
    diagnostics.push({
      code: "source-delete-source-only-managed-placement-remains",
      severity: "warning",
      category: "source-delete",
      message: "Managed target entries were deliberately retained; restart the affected client if it continues to cache the deleted skill.",
    });
  }
  return {
    ...deleted,
    sourceDeletion: {
      deleted: true,
      removedManagedPlacementCount: 0,
      remainingManagedPlacementCount: discovery.placements.length,
    },
    diagnostics,
    steps: ["LoadingAuthoritativePlacements", "DeletingSource", "DisablingGlobalEnrollment", "Completed"],
  };
}

async function disableGlobalEnrollmentForDeletedSource({ context, source, enrollmentStore }) {
  if (typeof enrollmentStore.readGlobalSkillEnrollments !== "function" || typeof enrollmentStore.writeGlobalSkillEnrollments !== "function") {
    return { ok: false, error: { code: "source-delete-source-only-enrollment-store-unavailable", severity: "warning", category: "source-delete", message: "Global enrollment could not be disabled after source-only deletion." } };
  }
  const readResult = await enrollmentStore.readGlobalSkillEnrollments({ repositoryPath: context.mainRepositoryPath });
  if (!readResult.ok) return { ok: false, error: readResult.error };
  const enrollments = (readResult.enrollments ?? []).filter((entry) => entry.sourceSkillId !== source.id);
  const writeResult = await enrollmentStore.writeGlobalSkillEnrollments({ repositoryPath: context.mainRepositoryPath, enrollments });
  return writeResult.ok ? { ok: true } : { ok: false, error: writeResult.error };
}

async function deleteSourceAfterManagedPlacementCleanup({
  context,
  input,
  skillRepository,
  targetStore,
  enrollmentStore,
}) {
  const source = input?.source;
  if (!source?.id || !source?.sourcePath) {
    return failure(
      "skill.source.delete.failed",
      {
        code: "source-delete-cleanup-source-identity-required",
        severity: "error",
        category: "source-delete",
        message: "Managed placement cleanup requires an identified source.",
      },
      ["ValidatingInput", "ValidationFailed"],
    );
  }
  if (typeof targetStore.scanAppliedSkills !== "function" || typeof targetStore.removeTargetEntry !== "function") {
    return failure(
      "skill.source.delete.failed",
      {
        code: "source-delete-cleanup-target-store-unavailable",
        severity: "error",
        category: "source-delete",
        message: "Managed placement cleanup is unavailable.",
      },
      ["ValidatingInput", "TargetStoreUnavailable"],
    );
  }

  const discovery = await discoverManagedSourcePlacements({ context, source, targetStore });
  if (!discovery.ok) {
    return failure("skill.source.delete.failed", discovery.error, [
      "ValidatingInput",
      "LoadingAuthoritativePlacements",
      "TargetScanFailed",
    ]);
  }

  const diagnostics = [...discovery.diagnostics];
  const enrollmentPreparation = await prepareGlobalEnrollmentForSourceDeletion({
    context,
    source,
    placements: discovery.placements,
    enrollmentStore,
  });
  if (!enrollmentPreparation.ok) {
    return failure("skill.source.delete.failed", enrollmentPreparation.error, [
      "LoadingAuthoritativePlacements",
      "PreparingDeletionPending",
      "EnrollmentWriteFailed",
    ]);
  }
  const remaining = [];
  let removedManagedPlacementCount = 0;
  for (const placement of discovery.placements) {
    const removeResult = await targetStore.removeTargetEntry({
      targetPath: placement.appliedSkill.targetPath,
    });
    if (!removeResult.ok) {
      diagnostics.push(removeResult.error);
      remaining.push(placement);
      continue;
    }

    const verification = await targetStore.scanAppliedSkills({
      targetPath: placement.target.targetPath,
      knownSourcePaths: [source.sourcePath],
    });
    if (!verification.ok) {
      diagnostics.push(verification.error);
      remaining.push(placement);
      continue;
    }
    if (hasExactManagedSourcePlacement({ appliedSkills: verification.appliedSkills, source })) {
      diagnostics.push({
        code: "source-delete-cleanup-verification-failed",
        severity: "error",
        category: "source-delete",
        targetId: placement.target.id,
        message: "Managed target placement remained after cleanup.",
      });
      remaining.push(placement);
      continue;
    }
    removedManagedPlacementCount += 1;
  }

  if (remaining.length > 0) {
    return {
      ok: true,
      sourceDeletion: {
        deleted: false,
        removedManagedPlacementCount,
        remainingManagedPlacementCount: remaining.length,
      },
      diagnostics,
      events: [{
        level: "ProductLog",
        code: "skill.source.delete.cleanup-pending",
        sourceSkillId: source.id,
        remainingManagedPlacementCount: remaining.length,
      }],
      steps: ["LoadingAuthoritativePlacements", "RemovingTargets", "VerificationFailed"],
    };
  }

  const deleted = await repositoryMutation({
    eventCode: "skill.source.delete.completed",
    unavailableCode: "source-delete-unavailable",
    methodName: "deleteSourceSkill",
    skillRepository,
    input: {
      repositoryPath: context.mainRepositoryPath,
      skillName: input?.skillName ?? source.name,
    },
    steps: ["DeletingSource"],
  });
  if (!deleted.ok) {
    return deleted;
  }
  if (enrollmentPreparation.enrollments) {
    const writeResult = await enrollmentStore.writeGlobalSkillEnrollments({
      repositoryPath: context.mainRepositoryPath,
      enrollments: enrollmentPreparation.enrollments.filter(
        (enrollment) => enrollment.sourceSkillId !== source.id,
      ),
    });
    if (!writeResult.ok) {
      diagnostics.push(writeResult.error);
    }
  }
  return {
    ...deleted,
    sourceDeletion: {
      deleted: true,
      removedManagedPlacementCount,
      remainingManagedPlacementCount: 0,
    },
    diagnostics,
    steps: ["LoadingAuthoritativePlacements", "RemovingTargets", "VerifyingTargets", "DeletingSource", "Completed"],
  };
}

async function prepareGlobalEnrollmentForSourceDeletion({ context, source, placements, enrollmentStore }) {
  if (!enrollmentStore) {
    return { ok: true, enrollments: null };
  }
  if (typeof enrollmentStore.readGlobalSkillEnrollments !== "function" || typeof enrollmentStore.writeGlobalSkillEnrollments !== "function") {
    return {
      ok: false,
      error: {
        code: "source-delete-cleanup-enrollment-store-unavailable",
        severity: "error",
        category: "source-delete",
        message: "Global enrollment cleanup is unavailable.",
      },
    };
  }
  const readResult = await enrollmentStore.readGlobalSkillEnrollments({
    repositoryPath: context.mainRepositoryPath,
  });
  if (!readResult.ok) {
    return { ok: false, error: readResult.error };
  }
  const globalTargetIds = new Set((context.globalTargets ?? []).map((target) => target.id));
  const globalPlacements = placements
    .filter(({ target }) => globalTargetIds.has(target.id))
    .map(({ target, appliedSkill }) => createAppliedSkillPlacement({
      targetId: target.id,
      applyMode: appliedSkill.kind === "managed-symlink" ? "symlink" : appliedSkill.metadata?.applyMode ?? "copy",
    }).value);
  const existing = (readResult.enrollments ?? []).find((entry) => entry.sourceSkillId === source.id);
  if (!existing && globalPlacements.length === 0) {
    return { ok: true, enrollments: readResult.enrollments ?? [] };
  }
  const pending = createGlobalSkillEnrollment({
    ...(existing ?? {}),
    sourceSkillId: source.id,
    defaultApplyMode: existing?.defaultApplyMode ?? context.defaultApplyMode ?? "copy",
    lifecycle: "deletion-pending",
    placements: globalPlacements.length > 0 ? globalPlacements : existing?.placements ?? [],
    remainingCleanupPlacements: globalPlacements,
  });
  if (!pending.ok) {
    return { ok: false, error: pending.diagnostics[0] };
  }
  const enrollments = [
    ...(readResult.enrollments ?? []).filter((entry) => entry.sourceSkillId !== source.id),
    pending.value,
  ];
  const writeResult = await enrollmentStore.writeGlobalSkillEnrollments({
    repositoryPath: context.mainRepositoryPath,
    enrollments,
  });
  if (!writeResult.ok) {
    return { ok: false, error: writeResult.error };
  }
  return { ok: true, enrollments };
}

async function discoverManagedSourcePlacements({ context, source, targetStore }) {
  const placements = [];
  const diagnostics = [];
  for (const target of [...(context?.globalTargets ?? []), ...(context?.projectTargets ?? [])]) {
    const result = await targetStore.scanAppliedSkills({
      targetPath: target.targetPath,
      knownSourcePaths: [source.sourcePath],
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    for (const appliedSkill of result.appliedSkills ?? []) {
      if (isExactManagedSourcePlacement({ appliedSkill, source })) {
        placements.push({ target, appliedSkill });
      }
    }
    diagnostics.push(...(result.diagnostics ?? []));
  }
  return { ok: true, placements, diagnostics };
}

function hasExactManagedSourcePlacement({ appliedSkills, source }) {
  return (appliedSkills ?? []).some((appliedSkill) =>
    isExactManagedSourcePlacement({ appliedSkill, source }),
  );
}

function isExactManagedSourcePlacement({ appliedSkill, source }) {
  if (appliedSkill?.kind !== "managed-copy" && appliedSkill?.kind !== "managed-symlink") {
    return false;
  }
  return appliedSkill.metadata?.sourceSkillId === source.id ||
    normalizeSourcePath(appliedSkill.sourcePath ?? appliedSkill.metadata?.sourcePath) === normalizeSourcePath(source.sourcePath);
}

function normalizeSourcePath(path) {
  return typeof path === "string" ? path.replace(/\\+/g, "/").replace(/\/+$/, "") : "";
}

export async function exportSourceSkill({ context, input, skillRepository }) {
  return repositoryMutation({
    eventCode: "skill.source.export.completed",
    unavailableCode: "source-export-unavailable",
    methodName: "exportSourceSkill",
    skillRepository,
    input: {
      repositoryPath: context.mainRepositoryPath,
      skillName: input?.skillName ?? input?.source?.name,
      archivePath: input?.archivePath,
    },
    steps: ["ValidatingInput", "WritingArchive"],
  });
}

export async function importSkillArchiveToMainRepository({
  context,
  input,
  skillRepository,
}) {
  return repositoryMutation({
    eventCode: "skill.source.importArchive.completed",
    unavailableCode: "source-import-archive-unavailable",
    methodName: "importSkillArchiveToMainRepository",
    skillRepository,
    input: {
      repositoryPath: context.mainRepositoryPath,
      archivePath: input?.archivePath,
      skillName: input?.skillName,
    },
    steps: ["ValidatingInput", "ReadingArchive", "WritingSource"],
  });
}

export async function listSkillBackups({ context, skillRepository }) {
  if (typeof skillRepository?.scanBackups !== "function") {
    return failure(
      "skill.backup.list.failed",
      {
        code: "backup-scan-unavailable",
        severity: "error",
        message: "Backup scan is unavailable.",
      },
      ["ScanningBackups", "BackupStoreUnavailable"],
    );
  }

  const result = await skillRepository.scanBackups({
    repositoryPath: context.mainRepositoryPath,
  });
  if (!result.ok) {
    return failure("skill.backup.list.failed", result.error, [
      "ScanningBackups",
      "ScanFailed",
    ]);
  }

  return {
    ok: true,
    backups: result.backups,
    diagnostics: result.diagnostics ?? [],
    events: [],
    steps: ["ScanningBackups", "ParsingMetadata", "MappingReadModel", "Completed"],
  };
}

export async function compareSkillBackup({ input, backupComparisonPort }) {
  const backupPath = backupPathFromInput(input);
  const referencePath = referencePathFromInput(input);

  if (!backupPath) {
    return failure(
      "skill.backup.compare.failed",
      {
        code: "backup-compare-backup-path-required",
        severity: "error",
        message: "Backup path is required.",
      },
      ["ValidatingInput", "ValidationFailed"],
    );
  }

  if (!referencePath) {
    return failure(
      "skill.backup.compare.failed",
      {
        code: "backup-compare-reference-path-required",
        severity: "error",
        message: "Reference path is required.",
      },
      ["ValidatingInput", "ValidationFailed"],
    );
  }

  if (typeof backupComparisonPort?.compareDirectories !== "function") {
    return failure(
      "skill.backup.compare.failed",
      {
        code: "backup-comparison-port-unavailable",
        severity: "error",
        message: "Backup comparison is unavailable.",
      },
      [
        "ValidatingInput",
        "CheckingComparisonPort",
        "ComparisonPortUnavailable",
      ],
    );
  }

  const result = await backupComparisonPort.compareDirectories({
    backupPath,
    referencePath,
  });

  if (!result.ok) {
    return failure("skill.backup.compare.failed", result.error, [
      "ValidatingInput",
      "CheckingComparisonPort",
      "ComparingBackup",
      "Failed",
    ]);
  }

  const comparison = comparisonSummaryFromPort({
    comparison: result.comparison,
    backupPath,
    referencePath,
  });

  return {
    ok: true,
    comparison,
    diagnostics: [],
    events: [
      {
        level: "ProductLog",
        code: "skill.backup.compare.completed",
        status: comparison.status,
        backupOnlyFileCount: comparison.backupOnlyFileCount,
        referenceOnlyFileCount: comparison.referenceOnlyFileCount,
        modifiedFileCount: comparison.modifiedFileCount,
        unchangedFileCount: comparison.unchangedFileCount,
      },
    ],
    steps: [
      "ValidatingInput",
      "CheckingComparisonPort",
      "ComparingBackup",
      "MappingSummary",
      "Completed",
    ],
  };
}

export async function restoreBackupToTarget({
  context,
  input,
  targetStore,
  auditStore,
}) {
  const backupPath = backupPathFromInput(input);
  const targetRootPath = targetRootPathFromInput(input);
  const skillName = skillNameFromRestoreInput(input);
  const targetId = targetIdFromRestoreInput(input);
  const clientType = nonEmptyString(input?.clientType ?? input?.target?.clientType);
  const snapshotId = nonEmptyString(input?.snapshotId ?? input?.backup?.snapshotId);
  const overwrite = input?.overwriteConfirmed === true;

  const validationDiagnostic = restoreValidationDiagnostic({
    context,
    backupPath,
    targetRootPath,
    skillName,
  });
  if (validationDiagnostic) {
    return restoreFailure({
      eventCode: "skill.backup.restore.failed",
      diagnostic: validationDiagnostic,
      steps: ["ValidatingInput", "ValidationFailed"],
      skillName,
      targetId,
      overwrite,
    });
  }

  if (typeof targetStore?.restoreBackupToTarget !== "function") {
    return restoreFailure({
      eventCode: "skill.backup.restore.failed",
      diagnostic: {
        code: "backup-restore-target-store-unavailable",
        severity: "error",
        message: "Backup restore target store is unavailable.",
      },
      steps: ["ValidatingInput", "CheckingPorts", "TargetStoreUnavailable"],
      skillName,
      targetId,
      overwrite,
    });
  }

  if (typeof auditStore?.appendRecord !== "function") {
    return restoreFailure({
      eventCode: "skill.backup.restore.failed",
      diagnostic: {
        code: "backup-restore-audit-store-unavailable",
        severity: "error",
        message: "Backup restore audit store is unavailable.",
      },
      steps: ["ValidatingInput", "CheckingPorts", "AuditStoreUnavailable"],
      skillName,
      targetId,
      overwrite,
    });
  }

  const restoreResult = await targetStore.restoreBackupToTarget({
    backupPath,
    targetRootPath,
    skillName,
    overwrite,
    metadata: restoreAppliedMetadata({
      backupPath,
      skillName,
      snapshotId,
      targetId,
      clientType,
    }),
  });

  if (!restoreResult.ok) {
    const isConflict = restoreResult.error?.code === "target-overwrite-rejected";
    return restoreFailure({
      eventCode: isConflict
        ? "skill.backup.restore.blocked"
        : "skill.backup.restore.failed",
      diagnostic: restoreResult.error,
      steps: isConflict
        ? ["ValidatingInput", "CheckingPorts", "CheckingConflict", "Blocked"]
        : [
            "ValidatingInput",
            "CheckingPorts",
            "CheckingConflict",
            "WritingTarget",
            "Failed",
          ],
      skillName,
      targetId,
      overwrite,
    });
  }

  const auditResult = await auditStore.appendRecord({
    repositoryPath: context.mainRepositoryPath,
    record: {
      operation: "backup-restore",
      code: "skill.backup.restore.completed",
      skillName,
      targetId,
      clientType,
      snapshotId,
      overwrite,
    },
  });

  if (!auditResult.ok) {
    return restoreFailure({
      eventCode: "skill.backup.restore.failed",
      diagnostic: auditResult.error,
      steps: [
        "ValidatingInput",
        "CheckingPorts",
        "CheckingConflict",
        "WritingTarget",
        "WritingAudit",
        "Failed",
      ],
      skillName,
      targetId,
      overwrite,
    });
  }

  return {
    ok: true,
    restored: {
      skillName,
      targetId,
      targetPath: restoreResult.targetPath,
      snapshotId,
      overwrite,
    },
    diagnostics: [],
    events: [
      {
        level: "ProductLog",
        code: "skill.backup.restore.completed",
        skillName,
        targetId,
        overwrite,
      },
    ],
    steps: [
      "ValidatingInput",
      "CheckingPorts",
      "CheckingConflict",
      "WritingTarget",
      "WritingAudit",
      "Completed",
    ],
  };
}

export async function promoteBackupToSkillSource({ context, input, skillRepository }) {
  return repositoryMutation({
    eventCode: "skill.backup.promote.completed",
    unavailableCode: "backup-promote-unavailable",
    methodName: "promoteBackupToSource",
    skillRepository,
    input: {
      repositoryPath: context.mainRepositoryPath,
      backupPath: input?.backupPath ?? input?.backup?.backupPath,
      skillName: input?.skillName,
    },
    steps: [
      "ValidatingInput",
      "LoadingBackup",
      "CheckingNameConflict",
      "CopyingBackupToSource",
      "WritingSourceMetadata",
    ],
  });
}

export async function deleteBackup({ input, skillRepository }) {
  if (input?.confirmationProvided !== true) {
    return failure(
      "skill.backup.delete.blocked",
      confirmationRequiredDiagnostic({
        code: "backup-delete-confirmation-required",
        operation: "backup-delete",
        confirmationKey: "confirmationProvided",
        message: "Backup delete requires explicit confirmation.",
      }),
      ["ValidatingInput", "ConfirmationRequired"],
    );
  }

  return repositoryMutation({
    eventCode: "skill.backup.delete.completed",
    unavailableCode: "backup-delete-unavailable",
    methodName: "deleteBackup",
    skillRepository,
    input: {
      backupPath: input?.backupPath ?? input?.backup?.backupPath,
    },
    steps: ["ValidatingInput", "DeletingBackup"],
  });
}

async function repositoryMutation({
  eventCode,
  unavailableCode,
  methodName,
  skillRepository,
  input,
  steps,
}) {
  if (typeof skillRepository?.[methodName] !== "function") {
    return failure(
      eventCode.replace(".completed", ".failed"),
      {
        code: unavailableCode,
        severity: "error",
        message: "Repository operation is unavailable.",
      },
      [...steps, "RepositoryOperationUnavailable"],
    );
  }

  const result = await skillRepository[methodName](input);
  if (!result.ok) {
    return failure(eventCode.replace(".completed", ".failed"), result.error, [
      ...steps,
      "OperationFailed",
    ]);
  }

  return {
    ok: true,
    result,
    diagnostics: [],
    events: [
      {
        level: "ProductLog",
        code: eventCode,
      },
    ],
    steps: [...steps, "Completed"],
  };
}

async function readSourceFiles({ source, skillRepository }) {
  if (typeof skillRepository?.readSourceSkillFiles !== "function") {
    return {
      ok: true,
      files: {},
    };
  }

  const result = await skillRepository.readSourceSkillFiles({
    sourcePath: source.sourcePath,
  });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    files: result.files,
  };
}

function pathForOpenInput(input) {
  if (input?.path) {
    return input.path;
  }

  if (input?.openKind === "skillMd" && input?.source?.sourcePath) {
    return `${input.source.sourcePath}/SKILL.md`;
  }

  if (input?.source?.sourcePath) {
    return input.source.sourcePath;
  }

  if (input?.appliedSkill?.targetPath) {
    return input.appliedSkill.targetPath;
  }

  return null;
}

function sourceAppliedTargetCount(source) {
  if (typeof source?.appliedTargetCount === "number") {
    return source.appliedTargetCount;
  }

  if (Array.isArray(source?.appliedTargets)) {
    return source.appliedTargets.length;
  }

  return 0;
}

function sanitizeAnalysisFindings(findings) {
  return (findings ?? []).map((finding) => {
    const evidence = finding?.evidence;
    return withoutUndefined({
      code: finding?.code,
      policyRuleCode: finding?.policyRuleCode,
      policyVersion: finding?.policyVersion,
      category: finding?.category,
      severity: finding?.severity,
      riskLevel: finding?.riskLevel,
      findingKind: finding?.findingKind,
      confidence: finding?.confidence,
      impact: finding?.impact,
      reachability: finding?.reachability,
      message: finding?.message,
      recommendation: finding?.recommendation,
      provenance: finding?.provenance,
      sourceId: finding?.sourceId,
      allowedActions: finding?.allowedActions,
      blockedActions: finding?.blockedActions,
      ...(evidence && {
        evidence: {
          relativePath: relativePathOnly(evidence.relativePath),
          line: Number.isInteger(evidence.line) ? evidence.line : undefined,
          summary: evidence.summary,
        },
      }),
    });
  });
}

function relativePathOnly(value) {
  const text = String(value ?? "").replace(/\\/g, "/");
  if (!text || text.startsWith("/") || /^[A-Za-z]:\//.test(text) || text.includes("..")) {
    return undefined;
  }
  return text;
}

function withoutUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, candidate]) => candidate !== undefined),
  );
}

function policyRuleCodesForAnalysis({ analysis, diagnostics }) {
  if (Array.isArray(analysis?.policyRuleCodes)) {
    return [...analysis.policyRuleCodes];
  }

  const seen = new Set();
  const codes = [];

  for (const diagnostic of diagnostics ?? []) {
    const code = diagnostic?.policyRuleCode;
    if (typeof code === "string" && code.length > 0 && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  return codes;
}

function backupPathFromInput(input) {
  return nonEmptyString(input?.backupPath ?? input?.backup?.backupPath);
}

function referencePathFromInput(input) {
  return nonEmptyString(
    input?.referencePath ??
      input?.source?.sourcePath ??
      input?.target?.targetPath ??
      input?.appliedSkill?.targetPath,
  );
}

function targetRootPathFromInput(input) {
  return nonEmptyString(input?.targetRootPath ?? input?.target?.targetPath);
}

function skillNameFromRestoreInput(input) {
  return nonEmptyString(input?.skillName ?? input?.backup?.skillName);
}

function targetIdFromRestoreInput(input) {
  return nonEmptyString(input?.targetId ?? input?.target?.id);
}

function restoreValidationDiagnostic({ context, backupPath, targetRootPath, skillName }) {
  if (!nonEmptyString(context?.mainRepositoryPath)) {
    return {
      code: "main-repository-path-required",
      severity: "error",
      message: "Main repository path is required.",
    };
  }

  if (!backupPath) {
    return {
      code: "backup-restore-backup-path-required",
      severity: "error",
      message: "Backup path is required.",
    };
  }

  if (!skillName) {
    return {
      code: "backup-restore-skill-name-required",
      severity: "error",
      message: "Skill name is required.",
    };
  }

  if (!targetRootPath) {
    return {
      code: "backup-restore-target-path-required",
      severity: "error",
      message: "Target path is required.",
    };
  }

  return null;
}

function restoreAppliedMetadata({
  backupPath,
  skillName,
  snapshotId,
  targetId,
  clientType,
}) {
  return {
    sourceSkillId: skillName,
    sourcePath: backupPath,
    applyMode: "copy",
    restoredFromBackup: true,
    backupSnapshotId: snapshotId,
    targetId,
    clientType,
  };
}

function comparisonSummaryFromPort({ comparison, backupPath, referencePath }) {
  const backupOnlyFiles = sortedStringArray(comparison?.backupOnlyFiles);
  const referenceOnlyFiles = sortedStringArray(comparison?.referenceOnlyFiles);
  const modifiedFiles = sortedStringArray(comparison?.modifiedFiles);
  const backupOnlyFileCount = numberOrLength(
    comparison?.backupOnlyFileCount,
    backupOnlyFiles,
  );
  const referenceOnlyFileCount = numberOrLength(
    comparison?.referenceOnlyFileCount,
    referenceOnlyFiles,
  );
  const modifiedFileCount = numberOrLength(
    comparison?.modifiedFileCount,
    modifiedFiles,
  );
  const unchangedFileCount = numberOrZero(comparison?.unchangedFileCount);
  const comparedFileCount =
    typeof comparison?.comparedFileCount === "number"
      ? comparison.comparedFileCount
      : backupOnlyFileCount +
        referenceOnlyFileCount +
        modifiedFileCount +
        unchangedFileCount;
  const status =
    comparison?.status ??
    (backupOnlyFileCount === 0 &&
    referenceOnlyFileCount === 0 &&
    modifiedFileCount === 0
      ? "identical"
      : "different");

  return {
    status,
    backupPath,
    referencePath,
    backupOnlyFiles,
    referenceOnlyFiles,
    modifiedFiles,
    unchangedFileCount,
    backupOnlyFileCount,
    referenceOnlyFileCount,
    modifiedFileCount,
    comparedFileCount,
  };
}

function nonEmptyString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function sortedStringArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item))
        .sort((left, right) => left.localeCompare(right))
    : [];
}

function numberOrLength(value, fallbackArray) {
  return typeof value === "number" ? value : fallbackArray.length;
}

function numberOrZero(value) {
  return typeof value === "number" ? value : 0;
}

function restoreFailure({
  eventCode,
  diagnostic,
  steps,
  skillName,
  targetId,
  overwrite,
}) {
  return {
    ok: false,
    diagnostics: [diagnostic],
    events: [
      {
        level: "ProductLog",
        code: eventCode,
        skillName,
        targetId,
        reason: diagnostic?.code,
        overwrite,
      },
    ],
    steps,
  };
}

function failure(eventCode, diagnostic, steps) {
  return {
    ok: false,
    diagnostics: [diagnostic],
    events: [
      {
        level: "ProductLog",
        code: eventCode,
        reason: diagnostic?.code,
      },
    ],
    steps,
  };
}
