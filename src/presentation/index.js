import { layerName as applicationLayerName } from "../application/index.js";
export {
  SPONZEY_COMMANDS,
  createCommandHandlers,
  createUseCaseCommandHandlers,
  registerSponzeyCommands,
} from "./command-registry.js";
export {
  collectCommandInput,
  wrapCommandHandlersWithInputCollection,
} from "./command-input-collector.js";
export {
  SPONZEY_TREE_VIEWS,
  mapSkillsReadModelToTreeItems,
} from "./tree-view-model.js";
export {
  createSkillsTreeDataProvider,
  createSkillsTreeDataProviders,
  refreshSponzeyTreeDataProviders,
  registerSponzeyTreeDataProviders,
} from "./tree-data-provider.js";
export { createGlobalSkillsWebviewProvider } from "./global-skills-webview-provider.js";
export {
  renderCommandResult,
  wrapCommandHandlerWithResultRendering,
} from "./command-result-renderer.js";
export { resolveDiagnosticActionCommand } from "./diagnostic-action-router.js";

export const layerName = "presentation";

export function describePresentationLayer() {
  return {
    layerName,
    callsInto: [applicationLayerName],
  };
}
