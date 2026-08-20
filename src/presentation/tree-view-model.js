export const SPONZEY_TREE_VIEWS = Object.freeze([
  { id: "sponzeySkills.mainRepository", name: "Main Repository" },
  { id: "sponzeySkills.globalSkills", name: "Global Skills" },
  {
    id: "sponzeySkills.projectSkills",
    name: "Project Skills",
    when: "workspaceFolderCount > 0",
  },
  { id: "sponzeySkills.diagnostics", name: "Diagnostics" },
]);

export function mapSkillsReadModelToTreeItems(readModel) {
  const sourceById = new Map(
    (readModel.mainRepositorySkills ?? []).map((skill) => [
      skill.id ?? skill.name,
      sourceFromSkill(skill),
    ]),
  );

  return [
    section("mainRepositorySkills", "Main Repository", [
      ...(readModel.mainRepositorySkills ?? []).map((skill) =>
        item({
          id: `source:${skill.name}`,
          label: skill.name,
          description: sourceDescription(skill),
          detail: skill.sourcePath,
          iconId: "repo",
          contextValue: "sponzeySkillSource",
          source: sourceFromSkill(skill),
        }),
      ),
      ...backupSectionItems(readModel.backups ?? []),
    ]),
    section(
      "globalSkills",
      "Global Skills",
      flatAppliedSkillItems(readModel.globalSkills ?? [], {
        scope: "global",
        sourceById,
      }),
    ),
    section(
      "projectSkills",
      "Project Skills",
      flatAppliedSkillItems(readModel.projectSkills ?? [], {
        scope: "project",
        sourceById,
      }),
    ),
    section(
      "diagnostics",
      "Diagnostics",
      diagnosticSectionItems({
        diagnostics: readModel.diagnostics ?? [],
        sourceById,
      }),
    ),
  ];
}

function flatAppliedSkillItems(groups, options = {}) {
  return groups.flatMap((group) =>
    Array.isArray(group.placements)
      ? [aggregateAppliedSkillItem(group, options)]
      : (group.skills ?? []).map((skill) => appliedSkillItem({ group, skill })),
  );
}

function aggregateAppliedSkillItem(row, { scope, sourceById } = {}) {
  const placements = row.placements ?? [];
  const source = row.sourceId ? sourceById?.get(row.sourceId) : undefined;
  const isGlobalEnrollment = scope === "global" && source !== undefined;
  return item({
    id: `aggregate-target-skill:${row.id}`,
    label: row.name,
    description: [row.kind, `${placements.length} target${placements.length === 1 ? "" : "s"}`].join(" · "),
    detail: placements.map((placement) => placement.targetPath).filter(Boolean).join(" · "),
    iconId: "organization",
    contextValue: isGlobalEnrollment
      ? "sponzeyGlobalEnrollment"
      : placements.length === 1
        ? "sponzeyAppliedSkill"
        : "sponzeyAggregatedAppliedSkill",
    source,
    target: placements.length === 1 ? targetFromGroup(placements[0]) : undefined,
    appliedSkill: placements.length === 1 ? appliedSkillFromSkill(placements[0].appliedSkill) : undefined,
    collapsible: false,
    children: [],
  });
}

function appliedSkillItem({ group, skill }) {
  const target = targetFromGroup(group);

  return item({
    id: `target-skill:${group.targetId}:${skill.name}`,
    label: skill.name,
    description: appliedSkillDescriptionWithTarget({ group, skill }),
    detail: appliedSkillDetailWithTarget({ group, skill }),
    iconId: iconIdForTarget(group),
    contextValue: "sponzeyAppliedSkill",
    target,
    appliedSkill: appliedSkillFromSkill(skill),
  });
}

function projectPatternFromGroup(group) {
  if (typeof group.targetPath !== "string" || !group.targetPath.includes("/")) {
    return null;
  }

  return group.targetPath.split("/").slice(-2).join("/");
}

function clientTypeLabel(clientType) {
  if (clientType === "codex") {
    return "Codex";
  }

  if (clientType === "claude") {
    return "Claude";
  }

  if (typeof clientType === "string" && clientType.trim().length > 0) {
    return clientType.trim();
  }

  return "Custom";
}

function backupSectionItems(backups) {
  if (!Array.isArray(backups) || backups.length === 0) {
    return [];
  }

  return [
    section(
      "backupSnapshots",
      "Backup Snapshots",
      backups.map((backup) =>
        item({
          id: `backup:${backup.skillName}:${backup.snapshotId}`,
          label: `${backup.skillName}:${backup.snapshotId}`,
          description: backup.createdAt ?? "backup",
          detail: backup.backupPath,
          iconId: "archive",
          contextValue: "sponzeySkillBackup",
          backup: backupFromBackupReadModel(backup),
        }),
      ),
    ),
  ];
}

function section(id, label, children) {
  return item({
    id,
    label,
    collapsible: true,
    children,
  });
}

function sectionWithIcon(id, label, children, iconId) {
  return item({
    id,
    label,
    collapsible: true,
    children,
    iconId,
  });
}

function sourceFromSkill(skill) {
  const source = {
    id: skill.id ?? skill.name,
    name: skill.name,
    sourcePath: skill.sourcePath,
  };

  if (skill.sourceHash !== undefined) {
    source.sourceHash = skill.sourceHash;
  }
  if (skill.riskLevel !== undefined) {
    source.riskLevel = skill.riskLevel;
  }
  if (skill.lastAnalyzedAt !== undefined) {
    source.lastAnalyzedAt = skill.lastAnalyzedAt;
  }
  if (skill.analysisStatus !== undefined) {
    source.analysisStatus = skill.analysisStatus;
  }
  if (skill.lastAnalyzedSourceHash !== undefined) {
    source.lastAnalyzedSourceHash = skill.lastAnalyzedSourceHash;
  }
  if (skill.diagnostics !== undefined) {
    source.diagnostics = skill.diagnostics;
  }
  if (skill.dependencies !== undefined) {
    source.dependencies = skill.dependencies;
  }
  if (skill.compatibility !== undefined) {
    source.compatibility = skill.compatibility;
  }
  if ((skill.appliedTargets?.length ?? 0) > 0) {
    source.appliedTargetCount = skill.appliedTargets.length;
  }

  return source;
}

function targetFromGroup(group) {
  const target = {
    id: group.targetId,
    clientType: group.clientType,
    scope: group.scope,
    targetPath: group.targetPath,
    workspacePath: group.workspacePath,
    targetPattern: group.targetPattern,
  };

  if (group.origin !== undefined) {
    target.origin = group.origin;
  }
  if (group.capabilities !== undefined) {
    target.capabilities = group.capabilities;
  }

  return target;
}

function appliedSkillFromSkill(skill) {
  const appliedSkill = {
    name: skill.name,
    kind: skill.kind,
    status: skill.status,
    targetPath: skill.targetPath,
    sourceId: skill.sourceId,
  };

  if (skill.syncStatus !== undefined) {
    appliedSkill.syncStatus = skill.syncStatus;
  }
  if (skill.sourceHash !== undefined) {
    appliedSkill.sourceHash = skill.sourceHash;
  }
  if (skill.targetHash !== undefined) {
    appliedSkill.targetHash = skill.targetHash;
  }
  if (skill.lastCheckedAt !== undefined) {
    appliedSkill.lastCheckedAt = skill.lastCheckedAt;
  }

  return appliedSkill;
}

function backupFromBackupReadModel(backup) {
  const mapped = {
    skillName: backup.skillName,
    snapshotId: backup.snapshotId,
    backupPath: backup.backupPath,
    createdAt: backup.createdAt,
  };

  if (backup.sourceHash !== undefined) {
    mapped.sourceHash = backup.sourceHash;
  }
  if (backup.promotedStatus !== undefined) {
    mapped.promotedStatus = backup.promotedStatus;
  }
  if (backup.metadata !== undefined) {
    mapped.metadata = backup.metadata;
  }
  if (backup.targetId !== undefined) {
    mapped.targetId = backup.targetId;
  }
  if (backup.targetPath !== undefined) {
    mapped.targetPath = backup.targetPath;
  }
  if (backup.clientType !== undefined) {
    mapped.clientType = backup.clientType;
  }
  if (backup.scope !== undefined) {
    mapped.scope = backup.scope;
  }

  return mapped;
}

function diagnosticFromReadModel(diagnostic) {
  return { ...diagnostic };
}

function sourceDescription(skill) {
  const count = skill.appliedTargets?.length ?? 0;
  const parts = [skill.status];
  if (count > 0) {
    parts.push(`${count} target${count === 1 ? "" : "s"}`);
  }
  if (skill.analysisStatus === "stale") {
    parts.push("analysis stale");
  }
  return parts.filter(Boolean).join(" · ");
}

function appliedSkillDescription(skill) {
  if (skill.syncStatus) {
    return `${skill.kind} · ${skill.syncStatus}`;
  }
  return skill.kind;
}

function appliedSkillDescriptionWithTarget({ group, skill }) {
  const parts = [clientTypeLabel(group.clientType), appliedSkillDescription(skill)];

  if (group.scope === "project") {
    const projectPattern = group.targetPattern ?? projectPatternFromGroup(group);
    if (projectPattern) {
      parts.splice(1, 0, projectPattern);
    }
  }

  return parts.join(" · ");
}

function appliedSkillDetailWithTarget({ group, skill }) {
  const targetPath =
    group.scope === "project"
      ? group.targetPattern ?? projectPatternFromGroup(group) ?? group.targetPath
      : group.targetPath;

  return [targetPath, skill.targetPath].filter(Boolean).join(" -> ");
}

function diagnosticSectionItems({ diagnostics, sourceById }) {
  const entries = diagnostics.map((diagnostic, index) => ({
    diagnostic,
    index,
  }));

  return severityKeys(entries).map((severity) => {
    const severityEntries = entries.filter(
      (entry) => diagnosticSeverity(entry.diagnostic) === severity,
    );
    return sectionWithIcon(
      `diagnostics:severity:${severity}`,
      severity,
      categoryKeys(severityEntries).map((category) => {
        const categoryEntries = severityEntries.filter(
          (entry) => diagnosticCategory(entry.diagnostic) === category,
        );
        return item({
          id: `diagnostics:severity:${severity}:category:${category}`,
          label: category,
          description: itemCountDescription(categoryEntries.length),
          collapsible: true,
          children: categoryEntries.map((entry) =>
            diagnosticItem({
              diagnostic: entry.diagnostic,
              index: entry.index,
              severity,
              category,
              sourceById,
            }),
          ),
        });
      }),
      iconIdForSeverity(severity),
    );
  });
}

function diagnosticItem({ diagnostic, index, severity, category, sourceById }) {
  const source = sourceById.get(diagnostic.sourceId);

  return item({
    id: `diagnostic:${severity}:${category}:${diagnostic.code}:${index}`,
    label: diagnostic.code,
    description: diagnosticDescription(diagnostic),
    detail: diagnosticDetail(diagnostic),
    iconId: iconIdForDiagnostic(diagnostic),
    contextValue: source ? "sponzeyDiagnosticWithSource" : "sponzeyDiagnostic",
    source,
    diagnostic: diagnosticFromReadModel(diagnostic),
    diagnosticActions: diagnosticActionsFromReadModel(diagnostic),
  });
}

function diagnosticDetail(diagnostic) {
  if (typeof diagnostic.recommendation !== "string") {
    return diagnostic.message;
  }

  return `${diagnostic.message} Next: ${diagnostic.recommendation}`;
}

function severityKeys(entries) {
  const keys = uniqueSortedKeys(entries.map((entry) =>
    diagnosticSeverity(entry.diagnostic),
  ));
  const order = ["error", "warning", "info"];

  return [
    ...order.filter((severity) => keys.includes(severity)),
    ...keys.filter((severity) => !order.includes(severity)),
  ];
}

function categoryKeys(entries) {
  return uniqueSortedKeys(entries.map((entry) =>
    diagnosticCategory(entry.diagnostic),
  ));
}

function uniqueSortedKeys(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function diagnosticSeverity(diagnostic) {
  return textOrNull(diagnostic.severity) ?? "info";
}

function diagnosticCategory(diagnostic) {
  return textOrNull(diagnostic.category) ?? "uncategorized";
}

function itemCountDescription(count) {
  return `${count} item${count === 1 ? "" : "s"}`;
}

function item({
  id,
  label,
  description,
  detail,
  collapsible = false,
  children = [],
  contextValue,
  source,
  target,
  appliedSkill,
  backup,
  diagnostic,
  diagnosticActions,
  iconId,
  clientBadges,
}) {
  const treeItem = {
    id,
    label,
    description,
    detail,
    collapsible,
    children,
  };

  if (iconId) {
    treeItem.iconId = iconId;
  }

  if (Array.isArray(clientBadges) && clientBadges.length > 0) {
    treeItem.clientBadges = [...clientBadges];
  }

  if (contextValue) {
    treeItem.contextValue = contextValue;
  }

  if (source) {
    treeItem.source = source;
  }

  if (target) {
    treeItem.target = target;
  }

  if (appliedSkill) {
    treeItem.appliedSkill = appliedSkill;
  }

  if (backup) {
    treeItem.backup = backup;
  }

  if (diagnostic) {
    treeItem.diagnostic = diagnostic;
  }

  if (diagnosticActions) {
    treeItem.diagnosticActions = diagnosticActions;
  }

  return treeItem;
}

function iconIdForTarget(group) {
  if (group.clientType === "codex") {
    return "agent-codex";
  }

  if (group.clientType === "claude") {
    return "agent-claude";
  }

  if (group.scope === "global") {
    return "globe";
  }

  if (group.scope === "project") {
    return "folder";
  }

  return "target";
}

function iconIdForDiagnostic(diagnostic) {
  return iconIdForSeverity(diagnostic.severity);
}

function iconIdForSeverity(severity) {
  if (severity === "error") {
    return "error";
  }

  if (severity === "warning") {
    return "warning";
  }

  return "info";
}

function diagnosticDescription(diagnostic) {
  const context =
    textOrNull(diagnostic.sourceId) ??
    textOrNull(diagnostic.targetId) ??
    textOrNull(diagnostic.targetPath);

  return [context, diagnostic.severity].filter(Boolean).join(" · ");
}

function diagnosticActionsFromReadModel(diagnostic) {
  const allowedActions = Array.isArray(diagnostic?.allowedActions)
    ? diagnostic.allowedActions
    : [];
  const blockedActions = Array.isArray(diagnostic?.blockedActions)
    ? diagnostic.blockedActions
    : [];

  if (allowedActions.length === 0 && blockedActions.length === 0) {
    return undefined;
  }

  return {
    allowedActionCodes: actionCodes(allowedActions),
    blockedActionCodes: actionCodes(blockedActions),
    confirmationRequiredActionCodes: actionCodes(
      allowedActions.filter((action) => action?.requiresConfirmation === true),
    ),
    hasBlockedActions: blockedActions.length > 0,
    hasMutatingAllowedActions: allowedActions.some(
      (action) => action?.mutatesTarget === true,
    ),
  };
}

function actionCodes(actions) {
  return actions
    .map((action) => textOrNull(action?.code))
    .filter((code) => code !== null);
}

function textOrNull(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
