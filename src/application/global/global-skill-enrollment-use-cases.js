import {
  createAppliedSkillPlacement,
  createGlobalSkillEnrollment,
  normalizePath,
} from "../../domain/index.js";
import { applySkillToTarget } from "../apply/apply-use-cases.js";

/**
 * Records a user's explicit Global intent before attempting target writes.
 * The persisted intent lets later reconciliation retry only targets that did
 * not receive a managed placement.
 */
export async function enrollSkillGlobally({
  context,
  input,
  skillRepository,
  enrollmentStore,
  applySkill = applySkillToTarget,
  analyzer,
  targetStore,
}) {
  const enrollmentResult = await enrollmentStore.readGlobalSkillEnrollments({
    repositoryPath: context.mainRepositoryPath,
  });
  if (!enrollmentResult.ok) {
    return reconciliationFailure({ error: enrollmentResult.error, step: "EnrollmentReadFailed" });
  }

  const existingResult = normalizeEnrollments(enrollmentResult.enrollments ?? []);
  if (!existingResult.ok) {
    return reconciliationFailure({ error: existingResult.error, step: "EnrollmentInvalid" });
  }

  let enrollments = existingResult.enrollments;
  if (!enrollments.some((entry) => entry.sourceSkillId === input.source.id)) {
    const created = createGlobalSkillEnrollment({
      sourceSkillId: input.source.id,
      defaultApplyMode: input.applyMode ?? context.defaultApplyMode,
    });
    if (!created.ok) {
      return reconciliationFailure({ error: created.diagnostics[0], step: "EnrollmentInvalid" });
    }
    enrollments = [...enrollments, created.value];
    const writeResult = await enrollmentStore.writeGlobalSkillEnrollments({
      repositoryPath: context.mainRepositoryPath,
      enrollments,
    });
    if (!writeResult.ok) {
      return reconciliationFailure({ error: writeResult.error, step: "EnrollmentWriteFailed" });
    }
  }

  return reconcileEnrollmentSet({
    context,
    enrollments,
    sources: [input.source],
    enrollmentStore,
    applySkill,
    analyzer,
    targetStore,
  });
}

/**
 * Applies each active enrollment only to its missing applyable Global targets.
 * Successful placements are persisted even if other targets reject the write.
 */
export async function reconcileGlobalSkillEnrollments({
  context,
  skillRepository,
  enrollmentStore,
  applySkill = applySkillToTarget,
  analyzer,
  targetStore,
}) {
  const enrollmentResult = await enrollmentStore.readGlobalSkillEnrollments({
    repositoryPath: context.mainRepositoryPath,
  });
  if (!enrollmentResult.ok) {
    return reconciliationFailure({ error: enrollmentResult.error, step: "EnrollmentReadFailed" });
  }
  const sourceResult = await skillRepository.scanSourceSkills({
    repositoryPath: context.mainRepositoryPath,
  });
  if (!sourceResult.ok) {
    return reconciliationFailure({ error: sourceResult.error, step: "SourceScanFailed" });
  }

  return reconcileEnrollmentSet({
    context,
    enrollments: enrollmentResult.enrollments ?? [],
    sources: sourceResult.sources ?? [],
    enrollmentStore,
    applySkill,
    analyzer,
    targetStore,
  });
}

/**
 * Stops future Global reconciliation for one source and removes only current
 * managed entries proven by its enrollment and source identity.
 */
export async function removeGlobalSkillEnrollment({
  context,
  input,
  skillRepository,
  enrollmentStore,
  targetStore,
}) {
  const [enrollmentResult, sourceResult] = await Promise.all([
    enrollmentStore.readGlobalSkillEnrollments({ repositoryPath: context.mainRepositoryPath }),
    skillRepository.scanSourceSkills({ repositoryPath: context.mainRepositoryPath }),
  ]);
  if (!enrollmentResult.ok) {
    return reconciliationFailure({ error: enrollmentResult.error, step: "EnrollmentReadFailed" });
  }
  if (!sourceResult.ok) {
    return reconciliationFailure({ error: sourceResult.error, step: "SourceScanFailed" });
  }

  const normalized = normalizeEnrollments(enrollmentResult.enrollments ?? []);
  if (!normalized.ok) {
    return reconciliationFailure({ error: normalized.error, step: "EnrollmentInvalid" });
  }
  const enrollment = normalized.enrollments.find(
    (entry) => entry.sourceSkillId === input.sourceSkillId,
  );
  const source = (sourceResult.sources ?? []).find(
    (entry) => entry.id === input.sourceSkillId,
  );
  if (!enrollment || !source) {
    return reconciliationFailure({
      error: {
        code: "global-enrollment-remove-source-not-found",
        severity: "error",
        category: "global-enrollment",
        message: "Global enrollment source could not be resolved for removal.",
      },
      step: "ValidatingInput",
    });
  }

  const targetById = new Map((context.globalTargets ?? []).map((target) => [target.id, target]));
  const remaining = [];
  const diagnostics = [];
  let removedTargetCount = 0;
  for (const placement of enrollment.placements) {
    const target = targetById.get(placement.targetId);
    if (!target || target.scope !== "global") {
      remaining.push(placement);
      diagnostics.push({
        code: "global-enrollment-remove-target-unavailable",
        severity: "warning",
        category: "global-enrollment",
        targetId: placement.targetId,
        message: "Managed Global placement target is unavailable for removal.",
      });
      continue;
    }
    const scanResult = await targetStore.scanAppliedSkills({
      targetPath: target.targetPath,
      knownSourcePaths: [source.sourcePath],
    });
    if (!scanResult.ok) {
      remaining.push(placement);
      diagnostics.push(scanResult.error);
      continue;
    }
    const applied = (scanResult.appliedSkills ?? []).find((skill) =>
      managedKind(skill.kind) &&
      (skill.metadata?.sourceSkillId === source.id ||
        normalizePath(skill.sourcePath ?? skill.metadata?.sourcePath) === normalizePath(source.sourcePath)),
    );
    if (!applied) {
      continue;
    }
    const removeResult = await targetStore.removeTargetEntry({ targetPath: applied.targetPath });
    if (!removeResult.ok) {
      remaining.push(placement);
      diagnostics.push(removeResult.error);
      continue;
    }
    removedTargetCount += 1;
  }

  const retained = normalized.enrollments.filter(
    (entry) => entry.sourceSkillId !== enrollment.sourceSkillId,
  );
  if (remaining.length > 0) {
    retained.push(
      createGlobalSkillEnrollment({
        ...enrollment,
        lifecycle: "deletion-pending",
        placements: remaining,
        remainingCleanupPlacements: remaining,
      }).value,
    );
  }
  const writeResult = await enrollmentStore.writeGlobalSkillEnrollments({
    repositoryPath: context.mainRepositoryPath,
    enrollments: retained,
  });
  if (!writeResult.ok) {
    return reconciliationFailure({ error: writeResult.error, step: "EnrollmentWriteFailed" });
  }

  return {
    ok: true,
    removal: {
      removedTargetCount,
      remainingTargetCount: remaining.length,
      removedEnrollment: remaining.length === 0,
    },
    diagnostics,
    events: [{
      level: "ProductLog",
      code: remaining.length > 0 ? "global-enrollment.remove.completed-with-diagnostics" : "global-enrollment.remove.completed",
      sourceSkillId: source.id,
      removedTargetCount,
    }],
    steps: ["LoadingEnrollment", "ScanningManagedPlacements", "RemovingTargets", "Completed"],
  };
}

async function reconcileEnrollmentSet({
  context,
  enrollments,
  sources,
  enrollmentStore,
  applySkill,
  analyzer,
  targetStore,
}) {
  const normalizedResult = normalizeEnrollments(enrollments);
  if (!normalizedResult.ok) {
    return reconciliationFailure({ error: normalizedResult.error, step: "EnrollmentInvalid" });
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const diagnostics = [];
  let appliedTargetCount = 0;
  let skippedTargetCount = 0;
  let failedTargetCount = 0;
  let changed = false;
  const nextEnrollments = [];

  for (const enrollment of normalizedResult.enrollments) {
    if (enrollment.lifecycle !== "active") {
      nextEnrollments.push(enrollment);
      continue;
    }
    const source = sourceById.get(enrollment.sourceSkillId);
    if (!source) {
      diagnostics.push({
        code: "global-enrollment-source-not-found",
        severity: "warning",
        category: "global-enrollment",
        sourceSkillId: enrollment.sourceSkillId,
        message: "Global enrollment source could not be found during reconciliation.",
      });
      nextEnrollments.push(enrollment);
      continue;
    }

    const placements = [...enrollment.placements];
    const placementTargetIds = new Set(placements.map((placement) => placement.targetId));
    for (const target of applyableGlobalTargets(context.globalTargets ?? [])) {
      if (placementTargetIds.has(target.id)) {
        skippedTargetCount += 1;
        continue;
      }

      const result = await applySkill({
        context,
        input: {
          source,
          target,
          applyMode: enrollment.defaultApplyMode,
          confirmationProvided: true,
        },
        analyzer,
        targetStore,
      });
      if (!result.ok) {
        failedTargetCount += 1;
        diagnostics.push(...(result.diagnostics ?? []));
        continue;
      }

      const placement = createAppliedSkillPlacement({
        targetId: target.id,
        applyMode: result.applied?.applyMode ?? enrollment.defaultApplyMode,
      });
      if (!placement.ok) {
        failedTargetCount += 1;
        diagnostics.push(placement.diagnostics[0]);
        continue;
      }
      placements.push(placement.value);
      placementTargetIds.add(target.id);
      appliedTargetCount += 1;
      changed = true;
    }

    const next = createGlobalSkillEnrollment({
      ...enrollment,
      placements: mergePlacements([], placements),
    });
    if (!next.ok) {
      return reconciliationFailure({ error: next.diagnostics[0], step: "EnrollmentInvalid" });
    }
    nextEnrollments.push(next.value);
  }

  if (changed) {
    const writeResult = await enrollmentStore.writeGlobalSkillEnrollments({
      repositoryPath: context.mainRepositoryPath,
      enrollments: nextEnrollments,
    });
    if (!writeResult.ok) {
      return reconciliationFailure({ error: writeResult.error, step: "EnrollmentWriteFailed" });
    }
  }

  return {
    ok: true,
    reconciliation: {
      appliedTargetCount,
      skippedTargetCount,
      failedTargetCount,
      wroteEnrollments: changed,
    },
    diagnostics,
    events: [
      {
        level: "ProductLog",
        code:
          failedTargetCount > 0
            ? "global-enrollment.reconciliation.completed-with-diagnostics"
            : "global-enrollment.reconciliation.completed",
        appliedTargetCount,
        failedTargetCount,
      },
    ],
    steps: [
      "LoadingEnrollments",
      "LoadingSources",
      "ApplyingMissingTargets",
      "VerifyingPlacements",
      failedTargetCount > 0 ? "CompletedWithDiagnostics" : "Completed",
    ],
  };
}

function normalizeEnrollments(enrollments) {
  const normalized = [];
  for (const enrollment of enrollments) {
    const result = createGlobalSkillEnrollment(enrollment ?? {});
    if (!result.ok) {
      return { ok: false, error: enrollmentInvalidDiagnostic() };
    }
    normalized.push(result.value);
  }
  return { ok: true, enrollments: normalized };
}

/**
 * Discovers pre-existing managed Global placements and records only their
 * durable intent. This migration never writes or removes target entries.
 */
export async function migrateExistingGlobalEnrollments({
  context,
  skillRepository,
  targetStore,
  enrollmentStore,
}) {
  const sourceResult = await skillRepository.scanSourceSkills({
    repositoryPath: context.mainRepositoryPath,
  });
  if (!sourceResult.ok) {
    return migrationFailure({ error: sourceResult.error, step: "SourceScanFailed" });
  }

  const enrollmentResult = await enrollmentStore.readGlobalSkillEnrollments({
    repositoryPath: context.mainRepositoryPath,
  });
  if (!enrollmentResult.ok) {
    return migrationFailure({ error: enrollmentResult.error, step: "EnrollmentReadFailed" });
  }

  const sourceByPath = new Map(
    (sourceResult.sources ?? []).map((source) => [
      normalizePath(source.sourcePath),
      source,
    ]),
  );
  const diagnostics = [];
  const discoveredBySourceId = new Map();

  for (const target of applyableGlobalTargets(context.globalTargets ?? [])) {
    const targetResult = await targetStore.scanAppliedSkills({
      targetPath: target.targetPath,
      knownSourcePaths: [...sourceByPath.keys()],
    });
    if (!targetResult.ok) {
      diagnostics.push(targetScanDiagnostic({ target, error: targetResult.error }));
      continue;
    }

    for (const appliedSkill of targetResult.appliedSkills ?? []) {
      const candidate = migrationCandidate({ appliedSkill, target, sourceByPath });
      if (!candidate.ok) {
        diagnostics.push(candidate.diagnostic);
        continue;
      }

      const placements = discoveredBySourceId.get(candidate.source.id) ?? [];
      placements.push(candidate.placement);
      discoveredBySourceId.set(candidate.source.id, placements);
    }
  }

  const mergeResult = mergeEnrollments({
    existingEnrollments: enrollmentResult.enrollments ?? [],
    discoveredBySourceId,
    defaultApplyMode: context.defaultApplyMode,
  });
  if (!mergeResult.ok) {
    return migrationFailure({ error: mergeResult.error, step: "EnrollmentInvalid" });
  }

  if (mergeResult.changed) {
    const writeResult = await enrollmentStore.writeGlobalSkillEnrollments({
      repositoryPath: context.mainRepositoryPath,
      enrollments: mergeResult.enrollments,
    });
    if (!writeResult.ok) {
      return migrationFailure({ error: writeResult.error, step: "EnrollmentWriteFailed" });
    }
  }

  return {
    ok: true,
    migration: {
      createdEnrollmentCount: mergeResult.createdEnrollmentCount,
      updatedEnrollmentCount: mergeResult.updatedEnrollmentCount,
      excludedPlacementCount: diagnostics.length,
      wroteEnrollments: mergeResult.changed,
    },
    diagnostics,
    events: [
      {
        level: "ProductLog",
        code: "global-enrollment.migration.completed",
        createdEnrollmentCount: mergeResult.createdEnrollmentCount,
        updatedEnrollmentCount: mergeResult.updatedEnrollmentCount,
        excludedPlacementCount: diagnostics.length,
      },
    ],
    steps: ["LoadingSources", "LoadingEnrollments", "ScanningGlobalTargets", "Completed"],
  };
}

function applyableGlobalTargets(targets) {
  return targets.filter(
    (target) =>
      target?.scope === "global" && target?.capabilities?.applyable !== false,
  );
}

function migrationCandidate({ appliedSkill, target, sourceByPath }) {
  if (appliedSkill?.kind === "broken-symlink") {
    return excluded("global-enrollment-migration-broken-excluded");
  }
  if (!managedKind(appliedSkill?.kind)) {
    return excluded("global-enrollment-migration-external-excluded");
  }

  const sourcePath = appliedSkill.sourcePath ?? appliedSkill.metadata?.sourcePath;
  const source = sourceByPath.get(normalizePath(sourcePath));
  if (!source) {
    return excluded("global-enrollment-migration-source-not-found");
  }

  const placement = createAppliedSkillPlacement({
    targetId: target.id,
    applyMode: modeForManagedSkill(appliedSkill),
  });
  if (!placement.ok) {
    return excluded("global-enrollment-migration-placement-invalid");
  }

  return { ok: true, source, placement: placement.value };
}

function mergeEnrollments({
  existingEnrollments,
  discoveredBySourceId,
  defaultApplyMode,
}) {
  const normalizedExisting = [];
  const existingBySourceId = new Map();
  for (const enrollment of existingEnrollments) {
    const result = createGlobalSkillEnrollment(enrollment ?? {});
    if (!result.ok) {
      return { ok: false, error: enrollmentInvalidDiagnostic() };
    }
    normalizedExisting.push(result.value);
    existingBySourceId.set(result.value.sourceSkillId, result.value);
  }

  let createdEnrollmentCount = 0;
  let updatedEnrollmentCount = 0;
  const enrollments = normalizedExisting.map((enrollment) => {
    const discovered = discoveredBySourceId.get(enrollment.sourceSkillId) ?? [];
    if (enrollment.lifecycle !== "active" || discovered.length === 0) {
      return enrollment;
    }
    const placements = mergePlacements(enrollment.placements, discovered);
    if (placements.length === enrollment.placements.length) {
      return enrollment;
    }
    updatedEnrollmentCount += 1;
    return createGlobalSkillEnrollment({
      ...enrollment,
      defaultApplyMode: chooseDefaultApplyMode({ placements, defaultApplyMode }),
      placements,
    }).value;
  });

  for (const [sourceSkillId, placements] of discoveredBySourceId) {
    if (existingBySourceId.has(sourceSkillId)) {
      continue;
    }
    createdEnrollmentCount += 1;
    enrollments.push(
      createGlobalSkillEnrollment({
        sourceSkillId,
        defaultApplyMode: chooseDefaultApplyMode({ placements, defaultApplyMode }),
        placements: mergePlacements([], placements),
      }).value,
    );
  }

  return {
    ok: true,
    enrollments,
    createdEnrollmentCount,
    updatedEnrollmentCount,
    changed: createdEnrollmentCount + updatedEnrollmentCount > 0,
  };
}

function mergePlacements(existing, discovered) {
  const byIdentity = new Map();
  for (const placement of [...existing, ...discovered]) {
    byIdentity.set(`${placement.targetId}:${placement.applyMode}`, placement);
  }
  return [...byIdentity.values()].sort((left, right) =>
    `${left.targetId}:${left.applyMode}`.localeCompare(
      `${right.targetId}:${right.applyMode}`,
    ),
  );
}

function chooseDefaultApplyMode({ placements, defaultApplyMode }) {
  const modes = new Set(placements.map((placement) => placement.applyMode));
  return modes.size === 1 ? [...modes][0] : defaultApplyMode;
}

function managedKind(kind) {
  return kind === "managed-symlink" || kind === "managed-copy";
}

function modeForManagedSkill(appliedSkill) {
  if (appliedSkill.kind === "managed-symlink") {
    return "symlink";
  }
  return appliedSkill.metadata?.applyMode === "symlink" ? "symlink" : "copy";
}

function excluded(code) {
  return {
    ok: false,
    diagnostic: {
      code,
      severity: "warning",
      category: "global-enrollment",
      message: "Applied target was excluded from Global enrollment migration.",
    },
  };
}

function targetScanDiagnostic({ target, error }) {
  return {
    code: "global-enrollment-migration-target-unavailable",
    severity: "warning",
    category: "global-enrollment",
    targetId: target.id,
    cause: error?.code,
    message: "Global target could not be scanned for enrollment migration.",
  };
}

function enrollmentInvalidDiagnostic() {
  return {
    code: "global-enrollment-migration-invalid-existing-enrollment",
    severity: "error",
    category: "global-enrollment",
    message: "Stored Global enrollment could not be migrated safely.",
  };
}

function migrationFailure({ error, step }) {
  return {
    ok: false,
    migration: null,
    diagnostics: [error],
    events: [
      {
        level: "ProductLog",
        code: "global-enrollment.migration.failed",
        reason: error?.code,
      },
    ],
    steps: [step],
  };
}
