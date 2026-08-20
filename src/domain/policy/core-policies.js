import { normalizePath } from "../model/core.js";

export const REPOSITORY_INDEX_SCHEMA_VERSION = 1;
export const ANALYZER_POLICY_VERSION = "builtin-policy-v1";

const BUILT_IN_ANALYZER_POLICY_RULES = Object.freeze(
  [
    analyzerPolicyRule({
      code: "missing-skill-md",
      category: "structure",
      severity: "critical",
      riskLevel: "critical",
      recommendation: "Add a SKILL.md file at the root of the skill directory.",
    }),
    analyzerPolicyRule({
      code: "malformed-frontmatter",
      category: "structure",
      severity: "high",
      riskLevel: "high",
      recommendation: "Close the frontmatter block with --- before the skill body.",
    }),
    analyzerPolicyRule({
      code: "malformed-frontmatter-line",
      category: "structure",
      severity: "warning",
      riskLevel: "low",
      recommendation: "Rewrite invalid frontmatter lines as key: value pairs.",
    }),
    analyzerPolicyRule({
      code: "missing-name",
      category: "structure",
      severity: "high",
      riskLevel: "high",
      recommendation: "Add a name field matching the skill directory name.",
    }),
    analyzerPolicyRule({
      code: "skill-name-directory-mismatch",
      category: "structure",
      severity: "warning",
      riskLevel: "low",
      recommendation: "Rename the directory or update frontmatter name so they match.",
    }),
    analyzerPolicyRule({
      code: "missing-description",
      category: "quality",
      severity: "high",
      riskLevel: "high",
      recommendation: "Add a specific activation condition in the description field.",
    }),
    analyzerPolicyRule({
      code: "broad-description",
      category: "quality",
      severity: "warning",
      riskLevel: "low",
      recommendation: "Describe the exact situation where this skill should be used.",
    }),
    analyzerPolicyRule({
      code: "missing-referenced-file",
      category: "structure",
      severity: "warning",
      riskLevel: "low",
      recommendation: "Add the referenced file or remove the stale reference.",
    }),
    analyzerPolicyRule({
      code: "destructive-rm-rf",
      category: "security",
      severity: "critical",
      riskLevel: "critical",
      recommendation:
        "Remove destructive shell instructions or require an explicit guarded workflow.",
    }),
    analyzerPolicyRule({
      code: "curl-pipe-shell",
      category: "security",
      severity: "critical",
      riskLevel: "critical",
      recommendation:
        "Replace curl-to-shell execution with explicit download, verification, and review steps.",
    }),
    analyzerPolicyRule({
      code: "secret-exfiltration-pattern",
      category: "security",
      severity: "critical",
      riskLevel: "critical",
      recommendation:
        "Remove instructions that send credentials or secret-like values over the network.",
    }),
    analyzerPolicyRule({
      code: "policy-override-pattern",
      category: "security",
      severity: "critical",
      riskLevel: "critical",
      recommendation: "Remove policy override language from the skill instructions.",
    }),
    analyzerPolicyRule({
      code: "unsafe-permission-change",
      category: "security",
      severity: "critical",
      riskLevel: "critical",
      recommendation: "Remove recursive world-writable permission changes and use the minimum explicit permission.",
    }),
    analyzerPolicyRule({
      code: "broad-allowed-tools",
      category: "dependency",
      severity: "medium",
      riskLevel: "medium",
      recommendation: "Limit allowed tools to the smallest explicit set required by the skill.",
    }),
    analyzerPolicyRule({
      code: "external-dependencies-detected",
      category: "dependency",
      severity: "warning",
      riskLevel: "low",
      recommendation: "Review external dependencies before applying this skill.",
    }),
    analyzerPolicyRule({
      code: "claude-only-compatibility",
      category: "compatibility",
      severity: "warning",
      riskLevel: "low",
      recommendation: "Review compatibility before applying this skill to Codex targets.",
    }),
    analyzerPolicyRule({
      code: "codex-only-compatibility",
      category: "compatibility",
      severity: "warning",
      riskLevel: "low",
      recommendation: "Review compatibility before applying this skill to non-Codex targets.",
    }),
  ],
);

const REMEDIATION_ACTIONS = Object.freeze({
  OPEN_SKILL_MD: remediationAction({
    code: "open-skill-md",
    sideEffect: "open-file",
    mutatesTarget: false,
    requiresConfirmation: false,
    safety: "safe",
  }),
  ANALYZE_AGAIN: remediationAction({
    code: "analyze-again",
    sideEffect: "analysis-refresh",
    mutatesTarget: false,
    requiresConfirmation: false,
    safety: "safe",
  }),
  APPLY_SKILL_WITH_CONFIRMATION: remediationAction({
    code: "apply-skill-to-target",
    sideEffect: "target-write",
    mutatesTarget: true,
    requiresConfirmation: true,
    safety: "confirmation-required",
  }),
  SET_MAIN_REPOSITORY: remediationAction({
    code: "set-main-repository",
    sideEffect: "configuration-update",
    mutatesTarget: false,
    requiresConfirmation: false,
    safety: "configuration-required",
  }),
  COMPARE_BACKUP: remediationAction({
    code: "compare-backup",
    sideEffect: "read-only-comparison",
    mutatesTarget: false,
    requiresConfirmation: false,
    safety: "safe",
  }),
});

const BLOCKED_REMEDIATION_ACTIONS = Object.freeze({
  APPLY_SKILL_TO_TARGET: Object.freeze({
    code: "apply-skill-to-target",
    reason: "critical-risk-blocked",
    mutatesTarget: true,
    requiresConfirmation: false,
    safety: "blocked",
  }),
});

export function createBuiltInAnalyzerPolicyPack() {
  return Object.freeze({
    id: "sponzey-built-in-analyzer-policy",
    version: ANALYZER_POLICY_VERSION,
    rules: BUILT_IN_ANALYZER_POLICY_RULES,
  });
}

export function evaluateRepositoryPathPolicy({
  mainRepositoryPath,
  targetPaths,
}) {
  const decisions = [];
  const mainPath = normalizePath(mainRepositoryPath);

  for (const targetPathInput of targetPaths) {
    const targetPath = normalizePath(targetPathInput);
    const relation = pathRelation(mainPath, targetPath);

    if (relation !== "separate") {
      decisions.push({
        allow: false,
        code: "main-repository-overlaps-target",
        severity: "error",
        relation,
        message: "Main repository path must be separate from skill target paths.",
      });
    }
  }

  return {
    allow: decisions.length === 0,
    decisions,
  };
}

export function decideRemovePolicy({ wouldDeleteSource, isExternal = false }) {
  if (wouldDeleteSource) {
    return {
      allow: false,
      code: "remove-cannot-delete-source",
      severity: "error",
      message: "Remove operation must not delete the source skill.",
    };
  }

  if (isExternal) {
    return {
      allow: false,
      code: "external-remove-blocked",
      severity: "error",
      message: "External target skill removal is blocked by default.",
    };
  }

  return {
    allow: true,
    code: "remove-target-only-allowed",
    severity: "info",
    message: "Remove operation may remove the target entry only.",
  };
}

export function decideTransferPolicy({ operationType, wouldMutateTarget }) {
  if (operationType === "backup-to-main" && wouldMutateTarget) {
    return {
      allow: false,
      code: "backup-cannot-mutate-target",
      severity: "error",
      message: "Backup operation must not mutate the target skill.",
    };
  }

  return {
    allow: true,
    code: "transfer-operation-allowed",
    severity: "info",
    message: "Transfer operation is allowed by domain policy.",
  };
}

export function decideRiskPolicy({
  riskLevel,
  confirmationProvided = false,
}) {
  if (riskLevel === "critical") {
    return {
      allow: false,
      requiresConfirmation: false,
      code: "critical-risk-blocked",
      severity: "critical",
      message: "Critical risk skills must be blocked before target write.",
    };
  }

  if (riskLevel === "high" && !confirmationProvided) {
    return {
      allow: false,
      requiresConfirmation: true,
      code: "high-risk-confirmation-required",
      severity: "high",
      message: "High risk skills require explicit confirmation.",
    };
  }

  return {
    allow: true,
    requiresConfirmation: false,
    code: "risk-accepted",
    severity: riskLevel ?? "low",
    message: "Risk level is allowed by domain policy.",
  };
}

export function decideAnalysisRisk({
  confirmedDiagnostics = [],
  potentialFindings = [],
} = {}) {
  const confirmedRiskLevel = highestDiagnosticRiskLevel(confirmedDiagnostics);
  if (confirmedRiskLevel === "critical") {
    return analysisRiskDecision({
      riskLevel: "critical",
      enforcement: "blocked",
      confidence: "high",
      impact: "critical",
      reachability: "direct",
      escalationReason: "confirmed-critical-finding",
    });
  }

  if (confirmedRiskLevel === "high") {
    return analysisRiskDecision({
      riskLevel: "high",
      enforcement: "confirmation-required",
      confidence: "high",
      impact: "high",
      reachability: "direct",
      escalationReason: "confirmed-high-finding",
    });
  }

  const correlation = potentialCorrelation(potentialFindings);
  if (correlation) {
    return analysisRiskDecision({
      riskLevel: "high",
      enforcement: "confirmation-required",
      confidence: "high",
      impact: "high",
      reachability: "correlated",
      escalationReason: correlation.reason,
      correlatedSignalFamilies: correlation.families,
    });
  }

  if (potentialFindings.length > 0) {
    return analysisRiskDecision({
      riskLevel: "medium",
      enforcement: "allow",
      confidence: "low",
      impact: "high",
      reachability: "unconfirmed",
      escalationReason: "isolated-potential-signal",
    });
  }

  return analysisRiskDecision({
    riskLevel: confirmedRiskLevel,
    enforcement: "allow",
    confidence: confirmedRiskLevel === "medium" ? "medium" : "high",
    impact: confirmedRiskLevel,
    reachability: "direct",
    escalationReason: "no-potential-escalation",
  });
}

export function decidePotentialAcknowledgement({
  finding,
  acknowledgement,
  sourceHash,
} = {}) {
  if (
    finding?.findingKind === "confirmed" &&
    diagnosticRiskLevel(finding) === "critical"
  ) {
    return acknowledgementDecision({
      allow: false,
      code: "confirmed-critical-acknowledgement-forbidden",
    });
  }

  const ruleCode = String(finding?.policyRuleCode ?? finding?.code ?? "").trim();
  const fingerprint = String(finding?.evidenceFingerprint ?? "").trim();
  if (
    finding?.findingKind !== "potential" ||
    !hasText(sourceHash) ||
    !hasText(ruleCode) ||
    !hasText(fingerprint) ||
    acknowledgement?.sourceHash !== sourceHash ||
    acknowledgement?.ruleCode !== ruleCode ||
    acknowledgement?.evidenceFingerprint !== fingerprint
  ) {
    return acknowledgementDecision({
      allow: false,
      code: "potential-acknowledgement-stale",
    });
  }

  return acknowledgementDecision({
    allow: true,
    code: "potential-acknowledgement-accepted",
  });
}

export function suggestRemediationActions({ diagnostic }) {
  const code = String(diagnostic?.code ?? "").trim();
  const category = String(diagnostic?.category ?? "").trim();

  if (mainRepositoryDiagnostic(code)) {
    return remediationResult({
      allowedActions: [
        REMEDIATION_ACTIONS.SET_MAIN_REPOSITORY,
        REMEDIATION_ACTIONS.ANALYZE_AGAIN,
      ],
      blockedActions: [],
    });
  }

  if (backupDiagnostic({ code, category })) {
    return remediationResult({
      allowedActions: [
        REMEDIATION_ACTIONS.COMPARE_BACKUP,
        REMEDIATION_ACTIONS.ANALYZE_AGAIN,
      ],
      blockedActions: [],
    });
  }

  const allowedActions = [
    REMEDIATION_ACTIONS.OPEN_SKILL_MD,
    REMEDIATION_ACTIONS.ANALYZE_AGAIN,
  ];
  const blockedActions = [];
  const riskDecision = decideRiskPolicy({
    riskLevel: diagnosticRiskLevel(diagnostic),
    confirmationProvided: false,
  });

  if (riskDecision.code === "critical-risk-blocked") {
    blockedActions.push(BLOCKED_REMEDIATION_ACTIONS.APPLY_SKILL_TO_TARGET);
  } else if (riskDecision.code === "high-risk-confirmation-required") {
    allowedActions.push(REMEDIATION_ACTIONS.APPLY_SKILL_WITH_CONFIRMATION);
  }

  return remediationResult({ allowedActions, blockedActions });
}

export function decideApplyConflictPolicy({ existingTargetKind }) {
  if (existingTargetKind === "external") {
    return {
      allow: false,
      code: "external-target-overwrite-forbidden",
      severity: "error",
      message: "External target skill must not be overwritten by default.",
    };
  }

  return {
    allow: true,
    code: "apply-conflict-allowed",
    severity: "info",
    message: "Apply operation is allowed by conflict policy.",
  };
}

export function evaluateSkillShadowingPolicy({
  globalSkillGroups = [],
  projectSkillGroups = [],
} = {}) {
  const globalGroupsByClientAndName = new Map();

  for (const group of globalSkillGroups) {
    for (const skill of group.skills ?? []) {
      if (!hasText(skill?.name)) {
        continue;
      }

      const key = skillClientNameKey({ clientType: group.clientType, skill });
      const groups = globalGroupsByClientAndName.get(key) ?? [];
      groups.push(group);
      globalGroupsByClientAndName.set(key, groups);
    }
  }

  const diagnostics = [];
  const seen = new Set();
  for (const projectGroup of projectSkillGroups) {
    for (const skill of projectGroup.skills ?? []) {
      if (!hasText(skill?.name)) {
        continue;
      }

      const key = skillClientNameKey({
        clientType: projectGroup.clientType,
        skill,
      });
      const globalGroups = globalGroupsByClientAndName.get(key) ?? [];
      for (const globalGroup of globalGroups) {
        const diagnosticKey = [
          projectGroup.targetId,
          globalGroup.targetId,
          projectGroup.clientType,
          skill.name,
        ].join("\0");
        if (seen.has(diagnosticKey)) {
          continue;
        }

        seen.add(diagnosticKey);
        diagnostics.push(
          skillShadowingDiagnostic({
            skill,
            projectGroup,
            globalGroup,
          }),
        );
      }
    }
  }

  return { diagnostics };
}

export function evaluateSkillNameConflictPolicy({
  sourceSkills = [],
  appliedSkillGroups = [],
} = {}) {
  const sourceByName = new Map();
  for (const source of sourceSkills) {
    if (hasText(source?.name)) {
      sourceByName.set(String(source.name).trim(), source);
    }
  }

  const diagnostics = [];
  const seen = new Set();
  for (const group of appliedSkillGroups) {
    for (const skill of group.skills ?? []) {
      if (!hasText(skill?.name) || !externalKind(skill.kind)) {
        continue;
      }

      const source = sourceByName.get(String(skill.name).trim());
      if (!source) {
        continue;
      }

      const diagnosticKey = [source.id, group.targetId, skill.name].join("\0");
      if (seen.has(diagnosticKey)) {
        continue;
      }

      seen.add(diagnosticKey);
      diagnostics.push(
        sourceTargetNameConflictDiagnostic({
          source,
          group,
          skill,
        }),
      );
    }
  }

  return { diagnostics };
}

export function calculateSyncStatus({
  kind,
  sourceExists = true,
  targetExists = true,
  sourceHash,
  targetHash,
  currentSourceHash,
  currentTargetHash,
}) {
  if (kind === "broken-symlink") {
    return "Broken Symlink";
  }

  if (kind === "external" || kind === "external-symlink") {
    return "External";
  }

  if (!sourceExists) {
    return "Missing Source";
  }

  if (!targetExists) {
    return "Missing Target";
  }

  if (kind === "managed-symlink") {
    return "In Sync";
  }

  const sourceChanged =
    hasText(sourceHash) &&
    hasText(currentSourceHash) &&
    sourceHash !== currentSourceHash;
  const targetChanged =
    hasText(targetHash) &&
    hasText(currentTargetHash) &&
    targetHash !== currentTargetHash;

  if (sourceChanged && targetChanged) {
    return "Both Changed";
  }

  if (sourceChanged) {
    return "Source Changed";
  }

  if (targetChanged) {
    return "Target Changed";
  }

  return "In Sync";
}

export function buildRepositoryIndex({
  sources = [],
  existingIndex = null,
  sourceHashByPath = new Map(),
  indexedAt,
} = {}) {
  const existingEntryByPath = new Map();
  const existingEntryByName = new Map();
  const nextIndexedAt = hasText(indexedAt)
    ? indexedAt
    : "1970-01-01T00:00:00.000Z";

  for (const entry of existingIndex?.sources ?? []) {
    if (hasText(entry?.sourcePath)) {
      existingEntryByPath.set(normalizePath(entry.sourcePath), entry);
    }
    if (hasText(entry?.sourceName)) {
      existingEntryByName.set(String(entry.sourceName).trim(), entry);
    }
  }

  const entries = sources.map((source) => {
    const sourcePath = normalizePath(source.sourcePath);
    const sourceName = String(source.name ?? "").trim();
    const existingEntry =
      existingEntryByPath.get(sourcePath) ?? existingEntryByName.get(sourceName);
    const sourceId =
      existingEntry?.sourceId ??
      (hasText(source.id)
        ? String(source.id).trim()
        : deterministicSourceId({ sourceName }));
    const sourceHash = sourceHashByPath.get(sourcePath);

    return withoutUndefinedProperties({
      sourceId,
      sourceName,
      sourcePath,
      sourceHash,
      origin: existingEntry?.origin ?? source.origin ?? "scanned",
      indexStatus: "indexed",
      indexedAt: nextIndexedAt,
    });
  });

  return {
    index: {
      schemaVersion: REPOSITORY_INDEX_SCHEMA_VERSION,
      indexedAt: nextIndexedAt,
      sources: entries,
    },
    entries,
  };
}

export function repositoryIndexUnsupportedVersionDiagnostic() {
  return {
    code: "repository-index-unsupported-version",
    severity: "warning",
    category: "repository",
    message: "Repository index schema version is unsupported.",
    recommendation: "Refresh the Main Repository to rebuild the index.",
  };
}

function pathRelation(leftPath, rightPath) {
  if (leftPath === rightPath) {
    return "equal";
  }

  if (leftPath.startsWith(`${rightPath}/`)) {
    return "main-inside-target";
  }

  if (rightPath.startsWith(`${leftPath}/`)) {
    return "target-inside-main";
  }

  return "separate";
}

function skillClientNameKey({ clientType, skill }) {
  return `${String(clientType ?? "unknown").trim()}\0${String(skill.name).trim()}`;
}

function skillShadowingDiagnostic({ skill, projectGroup, globalGroup }) {
  return {
    code: "potential-skill-shadowing",
    severity: "warning",
    category: "conflict",
    riskLevel: "low",
    message:
      "Project skill may shadow a global skill with the same name for the same client.",
    recommendation:
      "Inspect the project and global targets before applying or removing this skill.",
    skillName: String(skill.name).trim(),
    clientType: projectGroup.clientType ?? "unknown",
    targetId: projectGroup.targetId,
    targetPath: normalizePath(projectGroup.targetPath),
    shadowingTargetId: projectGroup.targetId,
    shadowedTargetId: globalGroup.targetId,
  };
}

function sourceTargetNameConflictDiagnostic({ source, group, skill }) {
  return {
    code: "source-target-name-conflict",
    severity: "warning",
    category: "conflict",
    riskLevel: "low",
    message:
      "A target skill with this name already exists outside main repository management.",
    recommendation:
      "Back up, move, or remove the existing target skill before applying this source.",
    skillName: String(skill.name).trim(),
    sourceId: source.id,
    targetId: group.targetId,
    targetPath: normalizePath(skill.targetPath ?? group.targetPath),
    targetKind: skill.kind,
    preservationPolicy: "preserve-existing-target",
  };
}

function externalKind(kind) {
  return kind === "external" || kind === "external-symlink";
}

function deterministicSourceId({ sourceName }) {
  const normalizedName = String(sourceName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `source:${normalizedName || "unnamed"}`;
}

function withoutUndefinedProperties(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function hasText(value) {
  return String(value ?? "").trim().length > 0;
}

function analyzerPolicyRule({
  code,
  category,
  severity,
  riskLevel,
  recommendation,
}) {
  return Object.freeze({
    code,
    category,
    severity,
    riskLevel,
    recommendation,
  });
}

function remediationAction({
  code,
  sideEffect,
  mutatesTarget,
  requiresConfirmation,
  safety,
}) {
  return Object.freeze({
    code,
    sideEffect,
    mutatesTarget,
    requiresConfirmation,
    safety,
  });
}

function remediationResult({ allowedActions, blockedActions }) {
  return Object.freeze({
    allowedActions: Object.freeze(allowedActions.map(cloneAction)),
    blockedActions: Object.freeze(blockedActions.map(cloneAction)),
  });
}

function cloneAction(action) {
  return Object.freeze({ ...action });
}

function diagnosticRiskLevel(diagnostic) {
  const riskLevel = String(diagnostic?.riskLevel ?? "").trim().toLowerCase();
  if (["low", "medium", "high", "critical"].includes(riskLevel)) {
    return riskLevel;
  }

  const severity = String(diagnostic?.severity ?? "").trim().toLowerCase();
  if (severity === "critical") {
    return "critical";
  }
  if (severity === "high") {
    return "high";
  }
  if (severity === "medium") {
    return "medium";
  }

  return "low";
}

function highestDiagnosticRiskLevel(diagnostics) {
  const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  return (diagnostics ?? []).reduce((highest, diagnostic) => {
    const candidate = diagnosticRiskLevel(diagnostic);
    return riskOrder[candidate] > riskOrder[highest] ? candidate : highest;
  }, "low");
}

function potentialCorrelation(potentialFindings) {
  const families = new Set(
    (potentialFindings ?? [])
      .map((finding) => String(finding?.signalFamily ?? "").trim())
      .filter(Boolean),
  );
  const correlations = [
    {
      families: ["credential", "network"],
      reason: "credential-network-correlation",
    },
    {
      families: ["download", "execution"],
      reason: "download-execution-correlation",
    },
    {
      families: ["broad-file-access", "destructive-intent"],
      reason: "broad-file-destructive-correlation",
    },
  ];

  return correlations.find((correlation) =>
    correlation.families.every((family) => families.has(family)),
  );
}

function analysisRiskDecision({
  riskLevel,
  enforcement,
  confidence,
  impact,
  reachability,
  escalationReason,
  correlatedSignalFamilies = [],
}) {
  return Object.freeze({
    riskLevel,
    enforcement,
    confidence,
    impact,
    reachability,
    escalationReason,
    correlatedSignalFamilies: Object.freeze([...correlatedSignalFamilies]),
  });
}

function acknowledgementDecision({ allow, code }) {
  return Object.freeze({
    allow,
    code,
    severity: allow ? "info" : "warning",
  });
}

function mainRepositoryDiagnostic(code) {
  return (
    code === "invalid-main-repository-path" ||
    code === "main-repository-path-required" ||
    code === "missing-main-repository" ||
    code === "main-repository-overlaps-target"
  );
}

function backupDiagnostic({ code, category }) {
  return (
    String(category).trim() === "backup" ||
    String(code).startsWith("backup-") ||
    String(code).includes(".backup.")
  );
}
