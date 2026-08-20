# Filesystem infrastructure source index

These adapters implement application ports with local filesystem operations. They must return classified failures rather than expose raw filesystem details to Domain or Presentation.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `file-system-analysis-store.js` | Atomically persist schema-v2 analysis metadata and report v1 metadata as stale. | Reads and writes repository metadata; never upgrades stale documents destructively. |
| `file-system-analysis-triage-store.js` | Atomically persist exact potential-finding acknowledgement identities. | Stores only source hash, rule code, and evidence fingerprint. |
| `file-system-backup-comparison-port.js` | Compare backup and target content. | Reads filesystem content. |
| `file-system-global-skill-enrollment-store.js` | Persist canonical Global enrollment metadata. | Atomic JSON write under `.sponzey/`. |
| `file-system-hash-port.js` | Hash readable skill directories, including target-root-bounded external content. | Reads filesystem content without following content outside the declared target root. |
| `file-system-repository-index-store.js` | Persist source-index metadata. | Reads and writes repository metadata. |
| `file-system-skill-repository.js` | Manage source skill directories and enumerate bounded analysis artifacts. | Reads and mutates repository files; analysis enumeration never follows symlinks and returns coverage gaps. |
| `file-system-target-store.js` | Scan and mutate applied target entries. | Reads and mutates target files. |
| `file-system-transfer-audit-store.js` | Persist transfer audit records. | Reads and writes repository metadata. |
| `local-git-skill-source-resolver.js` | Resolve source data from local Git. | Runs local Git adapter logic. |
| `local-git-version-control-port.js` | Read local repository version status. | Runs local Git adapter logic. |
