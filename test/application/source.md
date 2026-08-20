# Application test source index

Application tests verify use cases with explicit fake ports and immutable runtime-context fixtures. They must not access VSCode, process settings, or user filesystem locations.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `apply-use-cases.test.mjs` | Verify single-target apply and remove contracts. | Uses fake analyzer and target ports. |
| `global-skill-enrollment-use-cases.test.mjs` | Verify Global enrollment migration and reconciliation contracts. | Uses fake repository, target, and enrollment ports. |
| `refresh-skills.test.mjs` | Verify skills read-model refresh behavior. | Uses fake scan, hash, and metadata ports. |
| `*-use-cases.test.mjs` | Verify application workflows for repository, source, skill, and transfer operations. | Uses explicit fake ports. |
| `*-state-machine.test.mjs` | Verify application state transitions. | Pure state-machine tests. |
| `runtime-context-builder.test.mjs` | Verify one-time runtime configuration conversion. | Uses settings-reader fakes. |
| `refresh-invalidation-controller.test.mjs` | Verify refresh debounce and failure logging. | Uses refresh callback fakes. |
