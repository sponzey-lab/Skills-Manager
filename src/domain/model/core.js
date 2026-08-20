export function createSkillName(input) {
  const value = String(input ?? "").trim();

  if (value.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "invalid-skill-name",
          severity: "error",
          message: "Skill name must not be empty.",
        },
      ],
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      kind: "SkillName",
      value,
    }),
    diagnostics: [],
  };
}

export function createSkillSource({ id, name, sourcePath }) {
  return {
    ok: true,
    value: Object.freeze({
      kind: "SkillSource",
      id,
      name,
      sourcePath: normalizePath(sourcePath),
    }),
    diagnostics: [],
  };
}

export const GLOBAL_SKILL_ENROLLMENT_SCHEMA_VERSION = 1;

const applyModes = new Set(["symlink", "copy"]);
const globalEnrollmentLifecycles = new Set(["active", "deletion-pending"]);

/**
 * Creates the source-owned identity of one managed target placement. This
 * value never represents an external or name-only target item.
 */
export function createAppliedSkillPlacement({ targetId, applyMode }) {
  const normalizedTargetId = text(targetId);
  if (!normalizedTargetId) {
    return invalidValue({
      code: "invalid-applied-skill-placement-target",
      message: "Managed placements require a target identity.",
    });
  }

  if (!applyModes.has(applyMode)) {
    return invalidValue({
      code: "invalid-applied-skill-placement-mode",
      message: "Managed placements require a supported apply mode.",
    });
  }

  return validValue({
    kind: "AppliedSkillPlacement",
    targetId: normalizedTargetId,
    applyMode,
  });
}

/**
 * Creates the durable intent for a source to exist in every applyable Global
 * target. Pending cleanup is explicit so reconciliation cannot reapply a
 * source while source deletion is being retried.
 */
export function createGlobalSkillEnrollment({
  sourceSkillId,
  defaultApplyMode,
  lifecycle = "active",
  placements = [],
  remainingCleanupPlacements = [],
}) {
  const normalizedSourceSkillId = text(sourceSkillId);
  if (!normalizedSourceSkillId) {
    return invalidValue({
      code: "invalid-global-enrollment-source",
      message: "Global enrollments require a source identity.",
    });
  }

  if (!applyModes.has(defaultApplyMode)) {
    return invalidValue({
      code: "invalid-global-enrollment-mode",
      message: "Global enrollments require a supported default apply mode.",
    });
  }

  if (!globalEnrollmentLifecycles.has(lifecycle)) {
    return invalidValue({
      code: "invalid-global-enrollment-lifecycle",
      message: "Global enrollments require a supported lifecycle.",
    });
  }

  const normalizedPlacements = normalizePlacements(placements);
  if (!normalizedPlacements.ok) {
    return normalizedPlacements;
  }

  const normalizedRemainingCleanupPlacements = normalizePlacements(
    remainingCleanupPlacements,
  );
  if (!normalizedRemainingCleanupPlacements.ok) {
    return normalizedRemainingCleanupPlacements;
  }

  if (
    lifecycle !== "deletion-pending" &&
    normalizedRemainingCleanupPlacements.value.length > 0
  ) {
    return invalidValue({
      code: "invalid-global-enrollment-cleanup-state",
      message:
        "Remaining cleanup placements require the deletion-pending lifecycle.",
    });
  }

  return validValue({
    kind: "GlobalSkillEnrollment",
    sourceSkillId: normalizedSourceSkillId,
    defaultApplyMode,
    lifecycle,
    placements: normalizedPlacements.value,
    remainingCleanupPlacements: normalizedRemainingCleanupPlacements.value,
  });
}

const targetOrigins = new Set(["standard", "configured", "compatibility"]);

const defaultTargetCapabilities = Object.freeze({
  discoverable: true,
  applyable: true,
  removable: true,
  movable: true,
  copyable: true,
  backupable: true,
});

export function createSkillTarget({
  id,
  clientType,
  scope,
  targetPath,
  origin = "configured",
  capabilities = {},
}) {
  const normalizedCapabilities = Object.freeze({
    ...defaultTargetCapabilities,
    ...capabilities,
  });

  if (
    !targetOrigins.has(origin) ||
    (origin === "compatibility" &&
      (normalizedCapabilities.applyable ||
        normalizedCapabilities.removable ||
        normalizedCapabilities.movable))
  ) {
    return {
      ok: false,
      value: null,
      diagnostics: [
        {
          code: "invalid-target-capabilities",
          severity: "error",
          message:
            "Compatibility targets must not allow apply, remove, or move operations.",
        },
      ],
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      kind: "SkillTarget",
      id,
      clientType,
      scope,
      targetPath: normalizePath(targetPath),
      origin,
      capabilities: normalizedCapabilities,
    }),
    diagnostics: [],
  };
}

export function normalizePath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function normalizePlacements(value) {
  if (!Array.isArray(value)) {
    return invalidValue({
      code: "invalid-applied-skill-placements",
      message: "Managed placements must be an array.",
    });
  }

  const placements = [];
  for (const placement of value) {
    const result = createAppliedSkillPlacement(placement ?? {});
    if (!result.ok) {
      return result;
    }
    placements.push(result.value);
  }

  return validValue(Object.freeze(placements));
}

function validValue(value) {
  return {
    ok: true,
    value: Object.freeze(value),
    diagnostics: [],
  };
}

function invalidValue({ code, message }) {
  return {
    ok: false,
    value: null,
    diagnostics: [{ code, severity: "error", message }],
  };
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}
