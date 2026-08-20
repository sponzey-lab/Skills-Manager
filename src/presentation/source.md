# Presentation source index

Presentation maps application read models and closed use-case results to VSCode commands, tree items, and notifications. It does not decide domain policy or access the filesystem.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `command-input-collector.js` | Collect explicit command DTOs and target-specific placement selections. | Calls VSCode window adapters and reads application DTOs. |
| `command-result-renderer.js` | Render closed operation results. | Calls VSCode notification adapter. |
| `tree-view-model.js` | Map aggregate skill rows to flat tree DTOs; Main Repository, Global Skills, and Project Skills skill rows intentionally have no left icon, while managed Global rows carry their source payload for enrollment removal. | Pure presentation mapping. |
| `tree-data-provider.js` | Supply tree DTOs without adding left icons to skill rows. | Calls injected VSCode icon/event adapters. |
| `global-skills-webview-provider.js` | Render the flat Global Skills list with native-list-aligned skill names, right-side target-specific AI SVG images, and its contextual enrollment-removal action. | Calls injected VSCode webview/URI adapters and command callback. |
| `index.js` | Export presentation boundary APIs. | Public presentation module boundary. |
