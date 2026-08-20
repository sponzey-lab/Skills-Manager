import {
  SPONZEY_TREE_VIEWS,
  mapSkillsReadModelToTreeItems,
} from "./tree-view-model.js";

export { SPONZEY_TREE_VIEWS } from "./tree-view-model.js";

const COLLAPSIBLE_STATE = Object.freeze({
  none: 0,
  collapsed: 1,
});

const VIEW_SECTION_BY_VIEW_ID = Object.freeze({
  "sponzeySkills.mainRepository": "mainRepositorySkills",
  "sponzeySkills.globalSkills": "globalSkills",
  "sponzeySkills.projectSkills": "projectSkills",
  "sponzeySkills.diagnostics": "diagnostics",
});

export function createSkillsTreeDataProviders({
  loadReadModel,
  eventEmitterFactory,
  themeIconFactory,
}) {
  return Object.fromEntries(
    SPONZEY_TREE_VIEWS.map((view) => [
      view.id,
      createSkillsTreeDataProvider({
        viewId: view.id,
        loadReadModel,
        eventEmitter: eventEmitterFactory?.(view),
        themeIconFactory,
      }),
    ]),
  );
}

export function createSkillsTreeDataProvider({
  viewId,
  loadReadModel,
  eventEmitter = createNoopEventEmitter(),
  themeIconFactory = createDefaultThemeIcon,
}) {
  let cachedTreeItemsPromise = null;

  return {
    onDidChangeTreeData: eventEmitter.event,
    async refresh() {
      cachedTreeItemsPromise = null;
      eventEmitter.fire(undefined);
    },
    setReadModel(readModel) {
      cachedTreeItemsPromise = Promise.resolve(treeItemsForReadModel(readModel));
      eventEmitter.fire(undefined);
    },
    async getChildren(element) {
      if (element) {
        return element.children ?? [];
      }

      const sectionId = VIEW_SECTION_BY_VIEW_ID[viewId];
      const treeItems = await loadTreeItems();
      const section = treeItems.find((item) => item.id === sectionId);
      return section?.children ?? [];
    },
    getTreeItem(element) {
      const hasChildren =
        element.collapsible === true || (element.children?.length ?? 0) > 0;

      const treeItem = {
        id: element.id,
        label: element.label,
        description: element.description,
        tooltip: element.detail,
        collapsibleState: hasChildren
          ? COLLAPSIBLE_STATE.collapsed
          : COLLAPSIBLE_STATE.none,
      };

      if (element.contextValue) {
        treeItem.contextValue = element.contextValue;
      }

      if (element.source) {
        treeItem.source = element.source;
      }

      if (element.target) {
        treeItem.target = element.target;
      }

      if (element.appliedSkill) {
        treeItem.appliedSkill = element.appliedSkill;
      }

      if (element.iconId) {
        treeItem.iconPath = themeIconFactory(element.iconId);
      }

      return treeItem;
    },
  };

  async function loadTreeItems() {
    if (!cachedTreeItemsPromise) {
      cachedTreeItemsPromise = Promise.resolve(loadReadModel()).then((readModel) =>
        treeItemsForReadModel(readModel),
      );
    }

    return cachedTreeItemsPromise;
  }
}

export function refreshSponzeyTreeDataProviders({ providers, readModel }) {
  for (const view of SPONZEY_TREE_VIEWS) {
    const provider = providers?.[view.id];

    if (!provider) {
      continue;
    }

    if (readModel) {
      provider.setReadModel(readModel);
    } else {
      provider.refresh();
    }
  }
}

export function registerSponzeyTreeDataProviders({ windowApi, providers }) {
  return SPONZEY_TREE_VIEWS.flatMap((view) => {
    const provider = providers?.[view.id];
    if (provider?.kind === "webview" && typeof windowApi?.registerWebviewViewProvider === "function") {
      return [windowApi.registerWebviewViewProvider(view.id, provider)];
    }
    if (typeof windowApi?.registerTreeDataProvider === "function") {
      return [windowApi.registerTreeDataProvider(view.id, provider)];
    }
    return [];
  });
}

function createNoopEventEmitter() {
  return {
    event: undefined,
    fire() {},
  };
}

function createDefaultThemeIcon(iconId) {
  return { id: iconId };
}

function emptyReadModel() {
  return {
    mainRepositorySkills: [],
    globalSkills: [],
    projectSkills: [],
    diagnostics: [],
  };
}

function treeItemsForReadModel(readModel) {
  return mapSkillsReadModelToTreeItems(readModel ?? emptyReadModel());
}
