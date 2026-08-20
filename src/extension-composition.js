import {
  addGlobalRepository,
  addProjectRepository,
  applySkillToTarget,
  backupAppliedSkillToMainRepository,
  buildRuntimeContext,
  copyAppliedSkillToMainRepository,
  createRepositorySnapshot,
  createRepositorySkillAnalyzer,
  createSkill,
  analyzeAllSkills,
  compareSkillBackup,
  convertAppliedSkillMode,
  deleteBackup,
  deleteSourceSkill,
  enrollSkillGlobally,
  exportSourceSkill,
  getSkillDetail,
  importSkillToMainRepository,
  importSkillArchiveToMainRepository,
  installSkillToMainRepository,
  listSkillBackups,
  migrateExistingGlobalEnrollments,
  moveAppliedSkillToMainRepository,
  openMainRepository,
  openSkillPath,
  promoteBackupToSkillSource,
  renameSourceSkill,
  reconcileGlobalSkillEnrollments,
  removeGlobalSkillEnrollment,
  removeGlobalRepository,
  refreshSkills,
  removeAppliedSkill,
  removeMainRepository,
  removeProjectRepository,
  restoreBackupToTarget,
  setMainRepository,
  showDiagnostics,
  updateAppliedCopyFromSource,
} from "./application/index.js";
import {
  FileSystemAnalysisStore,
  FileSystemBackupComparisonPort,
  FileSystemHashPort,
  FileSystemGlobalSkillEnrollmentStore,
  FileSystemRepositoryIndexStore,
  FileSystemSkillRepository,
  FileSystemTargetStore,
  LocalGitSkillSourceResolver,
  LocalGitVersionControlPort,
} from "./infrastructure/index.js";
import { createUseCaseCommandHandlers } from "./presentation/index.js";

export async function createExtensionComposition({
  settingsReader,
  workspaceRoots = [],
  standardGlobalTargets = [],
  adapters = {},
  analyzer = null,
}) {
  const runtimeContextResult = await buildRuntimeContext({
    settingsReader,
    workspaceRoots,
    standardGlobalTargets,
  });

  if (!runtimeContextResult.ok) {
    return {
      ok: false,
      context: null,
      diagnostics: runtimeContextResult.diagnostics,
      commandHandlers: createUseCaseCommandHandlers({
        async getContext() {
          return null;
        },
        useCases: createSettingsUseCaseBundle({
          settingsWriter: adapters.settingsWriter,
          skillRepository: adapters.skillRepository,
        }),
      }),
    };
  }

  const context = runtimeContextResult.context;
  const usesDefaultSkillRepository = adapters.skillRepository === undefined;
  const skillRepository =
    adapters.skillRepository ?? new FileSystemSkillRepository();
  const targetStore = adapters.targetStore ?? new FileSystemTargetStore();
  const hashPort = adapters.hashPort ?? new FileSystemHashPort();
  const analysisStore = adapters.analysisStore ?? new FileSystemAnalysisStore();
  const repositoryIndexStore = Object.hasOwn(adapters, "repositoryIndexStore")
    ? adapters.repositoryIndexStore
    : usesDefaultSkillRepository
      ? new FileSystemRepositoryIndexStore()
      : null;
  const globalEnrollmentStore = Object.hasOwn(adapters, "globalEnrollmentStore")
    ? adapters.globalEnrollmentStore
    : usesDefaultSkillRepository
      ? new FileSystemGlobalSkillEnrollmentStore()
      : null;
  const versionControlPort = Object.hasOwn(adapters, "versionControlPort")
    ? adapters.versionControlPort
    : usesDefaultSkillRepository
      ? new LocalGitVersionControlPort()
      : null;
  const backupComparisonPort = Object.hasOwn(adapters, "backupComparisonPort")
    ? adapters.backupComparisonPort
    : usesDefaultSkillRepository
      ? new FileSystemBackupComparisonPort()
      : null;
  const skillSourceResolver =
    adapters.skillSourceResolver ?? new LocalGitSkillSourceResolver();
  const skillAnalyzer =
    analyzer ?? createRepositorySkillAnalyzer({ skillRepository });
  const useCases = createUseCaseBundle({
    skillRepository,
    targetStore,
    hashPort,
    analysisStore,
    repositoryIndexStore,
    versionControlPort,
    backupComparisonPort,
    analyzer: skillAnalyzer,
    skillSourceResolver,
    settingsWriter: adapters.settingsWriter,
    repositoryOpener: adapters.repositoryOpener,
    auditStore: adapters.auditStore,
    globalEnrollmentStore,
  });
  const globalEnrollmentLifecycle = await runGlobalEnrollmentLifecycle({
    context,
    globalEnrollmentStore,
    skillRepository,
    targetStore,
    analyzer: skillAnalyzer,
    enrollmentMutationNotifier: adapters.enrollmentMutationNotifier,
  });

  return {
    ok: true,
    context,
    diagnostics: runtimeContextResult.diagnostics,
    globalEnrollmentLifecycle,
    commandHandlers: createUseCaseCommandHandlers({
      async getContext() {
        return context;
      },
      useCases,
    }),
  };
}

async function runGlobalEnrollmentLifecycle({
  context,
  globalEnrollmentStore,
  skillRepository,
  targetStore,
  analyzer,
  enrollmentMutationNotifier,
}) {
  if (!globalEnrollmentStore) {
    return null;
  }

  const migration = await migrateExistingGlobalEnrollments({
    context,
    skillRepository,
    targetStore,
    enrollmentStore: globalEnrollmentStore,
  });
  if (!migration.ok) {
    return { migration, reconciliation: null, refreshRequested: false };
  }

  const reconciliation = await reconcileGlobalSkillEnrollments({
    context,
    skillRepository,
    targetStore,
    analyzer,
    enrollmentStore: globalEnrollmentStore,
  });
  const refreshRequested = Boolean(
    migration.migration?.wroteEnrollments || reconciliation.reconciliation?.wroteEnrollments,
  );
  if (refreshRequested && typeof enrollmentMutationNotifier === "function") {
    await enrollmentMutationNotifier();
  }
  return { migration, reconciliation, refreshRequested };
}

function createSettingsUseCaseBundle({ settingsWriter, skillRepository }) {
  return {
    async setMainRepository({ input }) {
      return setMainRepository({
        input,
        settingsWriter,
        skillRepository,
      });
    },
    async removeMainRepository({ input }) {
      return removeMainRepository({
        input,
        settingsWriter,
      });
    },
    async addGlobalRepository({ input }) {
      return addGlobalRepository({
        input,
        settingsWriter,
      });
    },
    async removeGlobalRepository({ input }) {
      return removeGlobalRepository({
        input,
        settingsWriter,
      });
    },
    async addProjectRepository({ input }) {
      return addProjectRepository({
        input,
        settingsWriter,
      });
    },
    async removeProjectRepository({ input }) {
      return removeProjectRepository({
        input,
        settingsWriter,
      });
    },
  };
}

function createUseCaseBundle({
  skillRepository,
  targetStore,
  hashPort,
  analysisStore,
  repositoryIndexStore,
  versionControlPort,
  backupComparisonPort,
  analyzer,
  skillSourceResolver,
  settingsWriter,
  repositoryOpener,
  auditStore,
  globalEnrollmentStore,
}) {
  const useCases = {
    ...createSettingsUseCaseBundle({ settingsWriter, skillRepository }),
    async openMainRepository({ context }) {
      return openMainRepository({
        context,
        repositoryOpener,
      });
    },
    async refreshSkills({ context }) {
      return refreshSkills({
        context,
        skillRepository,
        targetStore,
        hashPort,
        analysisStore,
        repositoryIndexStore,
        versionControlPort,
      });
    },
    async createRepositorySnapshot({ context, input }) {
      return createRepositorySnapshot({
        context,
        input,
        versionControlPort,
      });
    },
    async compareSkillBackup({ input }) {
      return compareSkillBackup({
        input,
        backupComparisonPort,
      });
    },
    async createSkill({ context, input }) {
      return createSkill({
        context,
        input,
        skillRepository,
      });
    },
    async removeAppliedSkill({ input }) {
      return removeAppliedSkill({
        input,
        targetStore,
      });
    },
    async copyAppliedSkillToMainRepository({ context, input }) {
      return copyAppliedSkillToMainRepository({
        context,
        input,
        skillRepository,
      });
    },
    async backupAppliedSkillToMainRepository({ context, input }) {
      return backupAppliedSkillToMainRepository({
        context,
        input,
        skillRepository,
      });
    },
    async moveAppliedSkillToMainRepository({ context, input }) {
      return moveAppliedSkillToMainRepository({
        context,
        input,
        skillRepository,
        targetStore,
      });
    },
    async showDiagnostics({ context }) {
      return showDiagnostics({
        context,
        skillRepository,
        targetStore,
        repositoryIndexStore,
        versionControlPort,
      });
    },
    async getSkillDetail({ input }) {
      return getSkillDetail({
        input,
        skillRepository,
        targetStore,
      });
    },
    async openSkillPath({ input }) {
      return openSkillPath({
        input,
        repositoryOpener,
      });
    },
    async analyzeAllSkills({ context }) {
      return analyzeAllSkills({
        context,
        analyzer,
        skillRepository,
        hashPort,
        analysisStore,
      });
    },
    async updateAppliedCopyFromSource({ input }) {
      return updateAppliedCopyFromSource({
        input,
        targetStore,
      });
    },
    async convertAppliedSkillMode({ input }) {
      return convertAppliedSkillMode({
        input,
        targetStore,
      });
    },
    async renameSourceSkill({ context, input }) {
      return renameSourceSkill({
        context,
        input,
        skillRepository,
      });
    },
    async deleteSourceSkill({ context, input }) {
      return deleteSourceSkill({
        context,
        input,
        skillRepository,
        targetStore,
        enrollmentStore: globalEnrollmentStore,
      });
    },
    async exportSourceSkill({ context, input }) {
      return exportSourceSkill({
        context,
        input,
        skillRepository,
      });
    },
    async importSkillArchiveToMainRepository({ context, input }) {
      return importSkillArchiveToMainRepository({
        context,
        input,
        skillRepository,
      });
    },
    async listSkillBackups({ context }) {
      return listSkillBackups({
        context,
        skillRepository,
      });
    },
    async promoteBackupToSkillSource({ context, input }) {
      return promoteBackupToSkillSource({
        context,
        input,
        skillRepository,
      });
    },
    async deleteBackup({ input }) {
      return deleteBackup({
        input,
        skillRepository,
      });
    },
    async restoreBackupToTarget({ context, input }) {
      return restoreBackupToTarget({
        context,
        input,
        targetStore,
        auditStore,
      });
    },
  };

  if (analyzer) {
    useCases.importSkillToMainRepository = async ({ context, input }) =>
      importSkillToMainRepository({
        context,
        input,
        skillRepository,
        analyzer,
      });
    useCases.installSkillToMainRepository = async ({ context, input }) =>
      installSkillToMainRepository({
        context,
        input,
        skillRepository,
        skillSourceResolver,
        analyzer,
      });
    useCases.applySkillToTarget = async ({ context, input }) => {
      if (input?.target?.scope === "global" && globalEnrollmentStore) {
        return enrollSkillGlobally({
          context,
          input,
          skillRepository,
          enrollmentStore: globalEnrollmentStore,
          analyzer,
          targetStore,
        });
      }
      return applySkillToTarget({
        context,
        input,
        analyzer,
        targetStore,
      });
    };
  }

  if (globalEnrollmentStore) {
    useCases.removeGlobalSkillEnrollment = async ({ context, input }) =>
      removeGlobalSkillEnrollment({
        context,
        input,
        skillRepository,
        enrollmentStore: globalEnrollmentStore,
        targetStore,
      });
  }

  return useCases;
}
