<p align="center">
  <img src="media/sponzey-skills-icon.png" width="112" alt="Sponzey Skills Manager icon">
</p>

<h1 align="center">Sponzey Skills Manager</h1>

<p align="center">
  Keep one clean library of Agent Skills, then use each skill exactly where you need it.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=Sponzey.sponzey-skills-manager"><img src="https://img.shields.io/visual-studio-marketplace/v/Sponzey.sponzey-skills-manager?style=flat-square&label=VS%20Code%20Marketplace" alt="VS Code Marketplace version"></a>
  <a href="https://github.com/Sponzey-com/Sponzey-Skill-Manager"><img src="https://img.shields.io/github/stars/Sponzey-com/Sponzey-Skill-Manager?style=flat-square" alt="GitHub stars"></a>
  <img src="https://img.shields.io/badge/license-GPL--2.0-6e7781?style=flat-square" alt="GPL-2.0 license">
</p>

---

Agent Skills tend to spread. One copy lives in Codex, another in Claude Code, a third is tucked inside a project—and sooner or later nobody is quite sure which one is current.

Sponzey Skills Manager gives those skills a proper home inside VS Code. Your **Main Repository** keeps the originals. **Global Skills** and **Project Skills** show where those originals are actually in use. You can apply, remove, inspect, back up, and recover skills without confusing a source with one of its installed copies.

## At a glance

| Main Repository | Global Skills | Project Skills | Diagnostics |
| --- | --- | --- | --- |
| The source of truth | Skills available to your AI clients | Skills scoped to the open workspace | Structure, sync, dependency, and security findings |

- Keep the original skill separate from every place it is used.
- Apply by symlink for instant updates or by copy for an independent snapshot.
- Enroll a global skill once and keep it aligned with supported targets added later.
- See Codex, Claude, and other recognized clients at a glance with client-specific marks.
- Find drift, broken links, shadowing, unsafe instructions, and incomplete analysis before they become surprises.
- Back up or bring an existing skill into the Main Repository without changing the live target.

## One source, as many targets as you need

```text
Main Repository
└── code-reviewer                 ← original
    ├── SKILL.md
    ├── references/
    └── scripts/
          │
          ├── Global · Codex      ← symlink or copy
          ├── Global · Claude     ← symlink or copy
          └── Project · my-app    ← symlink or copy
```

**Main Repository stores source skills only.** Main Repository is a source repository, deliberately kept separate from every Global Target. A skill only becomes available to an agent after you explicitly apply it. Removing an applied skill removes that placement; it does not delete the original.

## Built for day-to-day skill work

### Collect and create

Create a new `SKILL.md`-based skill, import a local folder, install from a GitHub URL, or restore a Sponzey archive. Repository URLs and GitHub folder URLs can discover multiple skills beneath the selected path.

### Apply with intent

Apply a source globally or to the current project. Choose **Symlink** when you want source edits to appear immediately, or **Copy** when the target needs to stand on its own.

Global enrollment is managed as one user decision. A skill can be applied to every eligible global target now and reconciled with newly registered targets later. Project targets remain separate and are never enrolled automatically.

### Understand what is installed

The sidebar distinguishes managed copies, managed symlinks, external skills, and broken links. Matching placements are shown as one readable row instead of a tree of target folders, while client marks show where the skill is available.

Copy-based skills are checked for drift and can report:

- In Sync
- Source Changed
- Target Changed
- Both Changed
- Missing Source or Target
- External
- Broken Symlink

### Back up and recover

Copy an applied skill into the Main Repository, make a non-destructive backup, move management back to the repository, compare snapshots, restore a target, or promote a backup into a new source.

These are separate actions on purpose. A backup never modifies the live target, and a remove action never silently deletes the source.

## Diagnostics that explain themselves

Analysis runs locally, statically, and without executing skill code. Findings are grouped by structure, quality, security, dependency, compatibility, conflict, and sync so you can see both the problem and the next useful action.

The analyzer makes an important distinction:

- **Confirmed** means a concrete risky behavior was found in an executable context.
- **Potential** means there are signals worth reviewing, but not enough evidence to call the skill unsafe.
- **Coverage gap** means something could not be inspected; it is never presented as a clean result.

A lone potential signal cannot become Critical. Only independent, correlated signals can ask for confirmation. Confirmed Critical behavior blocks a target write before the filesystem is changed.

Analysis is deliberately bounded to protect the editor: up to 2,000 files, depth 16, 1 MiB per text artifact, and 32 MiB per skill. Symlinks are not followed. Stored evidence uses relative paths and sanitized summaries rather than skill bodies, secrets, raw matches, or absolute local paths.

## Getting started

1. Install **Sponzey Skills Manager** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Sponzey.sponzey-skills-manager).
2. Open the Sponzey Skills view from the Activity Bar.
3. Let the extension create `~/SponzeySkills`, or run **Sponzey Skills: Set Main Repository** to choose another folder.
4. Create or import a skill into the Main Repository.
5. Right-click the skill and apply it globally or to the current project.
6. Open Diagnostics before applying unfamiliar skills.

The repository is initialized with:

```text
~/SponzeySkills/
├── skills/
├── backups/
└── .sponzey/
```

Do not choose an agent target such as `~/.agents/skills` or `~/.claude/skills` as the Main Repository. Those folders are deployment targets, not source libraries.

## Client support

Codex and Claude Code have built-in global and workspace discovery:

| Client | Global target | Project target |
| --- | --- | --- |
| Codex | `~/.agents/skills` | `<workspace>/.agents/skills` |
| Claude Code | `~/.claude/skills` | `<workspace>/.claude/skills` |

Additional targets can be registered from the view. Recognized clients use their own marks; an unobtrusive generic mark is used when a client has no bundled identity.

> After adding or removing a global skill, restart the affected client—or start a new session—if it keeps showing a cached skill list.

## Current development status

The core local workflow is implemented and covered by automated architecture, domain, use-case, adapter, integration, manifest, and build checks.

| Area | Status | What is available now |
| --- | :---: | --- |
| Source library | ✅ | Create, rename, import, install, export, and delete source skills |
| Global management | ✅ | Multi-target enrollment, future-target reconciliation, symlink and copy modes |
| Project management | ✅ | Workspace-aware discovery, apply, remove, update, and mode conversion |
| Existing skills | ✅ | External discovery plus copy, move, and backup into the Main Repository |
| Recovery | ✅ | Snapshot listing, comparison, restore, promotion, and deletion |
| Sync visibility | ✅ | Drift, missing targets, external placements, and broken-link reporting |
| Safety analysis | ✅ | Bounded static inspection, confirmed/potential findings, coverage reporting, and Critical write guard |
| Release pipeline | ✅ | Automated test/build gate, VSIX packaging, Marketplace publishing, and GitHub Release workflow |

Planned follow-up work includes registry discovery, Git-backed team workflows, richer policy packs, and deeper dependency intelligence. These are future directions, not requirements for the current local skill-management workflow.

## Useful commands

Most actions are available from a row's context menu. They are also available from the Command Palette under `Sponzey Skills:`.

| Task | Command |
| --- | --- |
| Choose the source library | `Sponzey Skills: Set Main Repository` |
| Create a skill | `Sponzey Skills: Create Skill` |
| Install from GitHub or a local path | `Sponzey Skills: Install Skill from URL or Path` |
| Analyze every source | `Sponzey Skills: Analyze All Skills` |
| Apply globally | `Sponzey Skills: Apply Skill to Global Target` |
| Apply to the workspace | `Sponzey Skills: Apply Skill to Project Target` |
| Remove a global enrollment | `Sponzey Skills: Remove Global Skill Enrollment` |
| Refresh the sidebar | `Sponzey Skills: Refresh Skills` |

## Troubleshooting

- **A deleted Codex or Claude skill still appears:** restart the client or begin a new session so it rescans its skill directory.
- **A target is missing:** missing standard target folders are treated as empty. Other readable targets continue to load.
- **Two external skills with the same name stay separate:** external placements are merged only when both their normalized names and readable content hashes match.
- **A warning appears in Diagnostics:** open the finding to see its category, confidence, location, impact, and recommended next step.
- **A copy cannot be updated:** inspect its sync state first. Overwriting target-side changes requires explicit confirmation.
- **A folder cannot be read or written:** fix its local permissions, then run **Sponzey Skills: Refresh Skills**.
- **The sidebar did not notice a filesystem change:** if the host blocked a watcher, run **Sponzey Skills: Refresh Skills** manually.
- **The `code` command is unavailable:** install VS Code's shell command, or run the helper with `CODE_BIN=/path/to/code`.

For operational troubleshooting, **Product Log** records minimal user-impacting outcomes. **Field Debug Log** is an opt-in, short-lived diagnostic channel; it is not intended to store skill bodies, credentials, or unrestricted command output.

## Contributing and local development

```sh
npm test
npm run build
npm run check:vsix-candidate
npm run release:gate
```

To launch an Extension Development Host directly:

```sh
scripts/run-vscode-extension-host.sh
```

To create a local VSIX candidate when `@vscode/vsce` is installed:

```sh
npm run package:vsix-candidate
```

`npm run check:vsix-candidate` checks for the local packaging tool without installing it. A `PackagingToolMissing` result means VSIX packaging was skipped until `@vscode/vsce` is available locally.

<details>
<summary>Maintainer release notes</summary>

The **Release VSIX** GitHub Actions workflow validates, packages, and publishes tagged builds. A release tag must match the version in `package.json`; for example:

```sh
git tag v0.2.0
git push origin v0.2.0
```

That workflow publishes the VSIX to the Marketplace and attaches the same artifact to a GitHub Release. A tag with an `a` suffix is build-only and skips publishing; `v0.1.1a` is an example of that convention.

</details>

Issues and ideas are welcome in the [GitHub issue tracker](https://github.com/Sponzey-com/Sponzey-Skill-Manager/issues).

---

<p align="center">
  <sub>Made for people who want their Agent Skills organized, understandable, and under their control.</sub>
</p>
