# Extension source index

These modules compose application and infrastructure adapters into the VSCode extension runtime. They do not own domain policy.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `extension.js` | Activate the VSCode extension, host commands, views, watchers, and runtime recomposition. | Uses VSCode host adapters. |
| `extension-composition.js` | Build a frozen runtime context, wire adapters, and run Global enrollment lifecycle. | Constructs infrastructure adapters and invokes application use cases. |
| `extension-runtime-session.js` | Replace compositions after settings changes and route commands to the current composition. | Maintains host lifecycle state. |
