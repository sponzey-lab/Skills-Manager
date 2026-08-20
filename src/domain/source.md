# Domain source index

The domain layer owns framework-independent skill identities, enrollment state, and policies. It performs no filesystem, VSCode, settings, process, network, or logging I/O.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `model/core.js` | Create immutable skill source, target, managed placement, and Global enrollment values. | Pure validation and normalization only. |
| `policy/core-policies.js` | Decide risk, remove, transfer, conflict, shadowing, and repository-index policies. | Pure domain policy only. |
| `index.js` | Export the public domain values and policies. | Public module boundary only. |
