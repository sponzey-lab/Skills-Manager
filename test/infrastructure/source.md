# Infrastructure test source index

Infrastructure tests exercise local adapter contracts in isolated temporary directories or deterministic fakes. They do not use the user's repositories or settings.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `file-system-*.test.mjs` | Verify filesystem metadata, hash, repository, and target adapters. | Uses temporary test directories only. |
| `local-git-*.test.mjs` | Verify local Git adapter contracts. | Uses isolated repository fixtures. |
| `event-logger.test.mjs` | Verify logging adapter masking and routing. | Uses in-memory logger fixtures. |
| `vscode-*.test.mjs` | Verify VSCode adapter conversions. | Uses fake VSCode API objects. |
| `transfer-audit-store.test.mjs` | Verify transfer audit persistence. | Uses temporary test directories only. |
