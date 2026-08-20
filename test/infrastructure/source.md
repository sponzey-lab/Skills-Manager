# Infrastructure test source index

Infrastructure tests exercise local adapter contracts in isolated temporary directories or deterministic fakes. They do not use the user's repositories or settings.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `file-system-*.test.mjs` | Verify filesystem metadata, hash, repository, target, and bounded analysis-artifact adapters. | Uses temporary test directories only. |
| `file-system-analysis-triage-store.test.mjs` | Verify acknowledgement identity persistence and raw-value exclusion. | Uses a temporary repository only. |
| `local-git-*.test.mjs` | Verify local Git adapter contracts. | Uses isolated repository fixtures. |
| `event-logger.test.mjs` | Verify logging adapter masking and routing. | Uses in-memory logger fixtures. |
| `vscode-*.test.mjs` | Verify VSCode adapter conversions. | Uses fake VSCode API objects. |
| `transfer-audit-store.test.mjs` | Verify transfer audit persistence. | Uses temporary test directories only. |
