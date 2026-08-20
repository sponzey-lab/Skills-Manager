# Phase 004 릴리스 스모크 체크리스트

이 체크리스트는 Sponzey Skills Manager가 VSCode Extension Development Host에서 Phase 004 로컬 릴리스 후보로 사용할 수 있는지 검증한다. 자동 테스트가 통과한 뒤 실행한다.

## 1. 자동 검증

- [x] `npm test`가 통과한다.
- [x] `npm run build`가 통과한다.
- [x] `npm run check:vsix-candidate`가 네트워크 설치 없이 local packaging 가능 여부 또는 `PackagingToolMissing`을 보고한다.
- [x] `npm run release:gate`가 통과한다.
- [x] command registry와 `package.json` command contribution이 일치한다.
- [x] Extension manifest 검증이 commands, views, menus, configuration, activity bar icon을 확인한다.
- [x] Extension manifest 검증이 `displayName`, `categories`, `keywords`, `extensionKind` 같은 package metadata를 확인한다.
- [x] Architecture guard가 Domain, Application, Infrastructure, Presentation, Scripts 의존 방향을 확인한다.

## 2. 확장 개발 호스트

- [ ] `scripts/run-vscode-extension-host.sh`가 VSCode Extension Development Host를 연다.
- [ ] `code` shell command를 사용할 수 없으면 script가 설치 방법 또는 `CODE_BIN` 설정 방법을 설명한다.
- [ ] Activity Bar에 Sponzey Skills 아이콘이 표시된다.
- [ ] Main Repository, Global Skills, Diagnostics view가 표시된다.
- [ ] workspace folder가 열려 있으면 Project Skills view가 표시된다.
- [ ] 파일만 연 VSCode window에서는 Project Skills view가 숨겨진다.
- [ ] Open SKILL.md가 현재 VSCode window의 새 탭에서 파일을 연다.

## 3. 리포지토리 설정

- [ ] repository path가 설정되지 않은 상태에서 extension이 기본 Main Repository인 `~/SponzeySkills`를 생성하고 사용한다.
- [ ] Main Repository 초기화가 `skills/`, `backups/`, `.sponzey/`를 생성한다.
- [ ] Main Repository는 source repository로만 표시되고 Global Target으로 표시되지 않는다.
- [ ] `~/.agents/skills` 또는 `~/.claude/skills` 같은 agent target path를 Main Repository로 선택하면 차단되거나 경고된다.
- [ ] 유효한 repository에서 Main Repository refresh를 실행해도 filesystem operation failed notification이 표시되지 않는다.
- [ ] Add repository와 remove repository toolbar action이 필요한 위치에 표시된다.

## 4. 리포지토리 인덱스와 버전 관리

- [ ] Repository Index V2가 source skill에 안정적인 `sourceId`를 부여하거나 유지한다.
- [ ] Repository index metadata가 source hash, origin, schema version, index status를 저장한다.
- [ ] 지원하지 않는 index metadata schema는 refresh를 깨지 않고 diagnostic으로 표시된다.
- [ ] Local Git versioning이 Main Repository 흐름을 막지 않고 unavailable 또는 non-Git status를 표시한다.
- [ ] Local Git snapshot 생성은 commit 작업 전에 명시적 확인을 요구한다.

## 5. Main Repository 스킬 생명주기

- [ ] Main Repository에 source skill을 생성한다.
- [ ] local skill folder를 Main Repository로 import한다.
- [ ] Git URL 또는 local path install이 source skill을 Main Repository에 추가한다.
- [ ] Import Skill Archive가 archive command를 통해 source skill 또는 backup bundle을 추가한다.
- [ ] Open Source Folder가 source folder를 연다.
- [ ] Delete Source Skill이 Remove Applied Skill과 명확히 구분된다.

## 6. Global 및 Project 적용

- [ ] Apply to Global Target이 persistent enrollment를 만들고 현재 applyable Global client 전체에 적용하며, 새 client target 등록 뒤 누락 placement를 자동 조정한다.
- [ ] workspace folder가 열려 있을 때 Apply to Project Target이 Codex, Claude, all supported clients 중 선택하게 한다.
- [ ] Main Repository, Global Skills, Project Skills의 스킬 행은 왼쪽 아이콘 없이 일관되게 표시하고 스킬 이름의 왼쪽 기준선을 동일하게 맞춘다. Global Skills는 target folder grouping과 target child 없이 source/hash aggregate row 한 행으로 표시하고, 스킬 이름 오른쪽에 Codex/OpenAI, Claude, Gemini, GitHub Copilot, Cursor, Perplexity, Mistral, DeepSeek, Meta AI, Hugging Face, Ollama 중 target에 맞는 SVG image를 표시한다. 미지원 AI는 공통 custom generic image를 사용한다.
- [ ] Global Skills의 managed aggregate row를 우클릭하면 `Remove Global Skill Enrollment`가 표시되고, 확인 후 모든 enrolled Global placement만 해제한다.
- [ ] Project Skills row는 target folder grouping과 target child 없이 source/hash aggregate row 한 행으로 표시한다.
- [ ] Target Profile logic이 apply, scan, diagnostics, badge, compatibility 결정을 일관되게 만든다.
- [ ] Managed copy, managed symlink, external folder, external symlink, broken symlink 상태가 구분된다.
- [ ] 같은 이름 external은 readable content hash까지 같을 때만 한 행으로 합쳐지고, hash 실패·target root 밖 항목은 별도 행 및 Diagnostics로 유지된다. broken symlink는 active Global/Project row가 아니라 Diagnostics에만 표시된다.
- [ ] Remove Applied Skill은 target entry만 제거하고 source skill을 삭제하지 않는다.
- [ ] source delete와 applied remove는 command, prompt, command path가 분리되어 있다.
- [ ] Delete Source Skill에서 cleanup을 선택하면 화면의 기존 applied count와 무관하게 현재 Global/Project target을 다시 스캔하고, exact managed copy/symlink만 제거·재검증한 뒤 source를 삭제한다.
- [ ] cleanup target 제거 실패 시 source는 남고 Global enrollment는 `deletion-pending`으로 남아 재시도해도 자동 재적용되지 않는다.
- [ ] source-only 삭제는 Global enrollment를 해제하고 target copy 또는 broken symlink가 남을 수 있음을 알린다. Codex가 이전 skill을 보이면 새 Codex 세션을 열어 target 재탐색 후 사라졌는지 확인한다.

## 7. Diagnostics와 Analysis

- [ ] Analyze All Skills가 total diagnostics와 highest severity를 요약 notification으로 표시한다.
- [ ] Analyze All Skills가 Diagnostics view를 갱신한다.
- [ ] Diagnostics view가 diagnostic code, severity, category, source 또는 target context를 표시한다.
- [ ] Built-In Analyzer Policy Pack이 policy code, recommendation, dependency category, analyzer version을 보고한다.
- [ ] Diagnostics가 external dependencies, security risks, compatibility warnings, malformed structure, sync issues를 설명한다.
- [ ] Diagnostics는 `SKILL.md` body 전체, secret, raw matched secret-like value를 노출하지 않는다.
- [ ] Diagnostic detail 또는 Open SKILL.md가 현재 VSCode window에서 열린다.
- [ ] source skill이 변경되면 watcher refresh 이후 stale analysis로 식별된다.

## 8. 백업 전송과 안전성

- [ ] Copy Applied Skill to Main Repository는 target 상태를 복사하되 target은 변경하지 않는다.
- [ ] Backup Applied Skill to Main Repository는 target을 변경하지 않고 snapshot을 만든다.
- [ ] Backup Compare는 source/target 차이를 보여주되 source나 target을 변경하지 않는다.
- [ ] Restore Backup to Target은 기존 target entry를 덮어쓰기 전에 명시적 확인을 요구한다.
- [ ] Move Applied Skill to Main Repository는 target cleanup 또는 managed conversion 전에 명시적 확인을 요구한다.
- [ ] Promote Backup to Skill Source는 명시적 확인 없이 기존 source를 덮어쓰지 않는다.
- [ ] Delete Backup은 promoted source skill이나 target entry를 삭제하지 않는다.
- [ ] High risk action은 명시적 확인을 요구한다.
- [ ] Critical risk apply는 target filesystem write 전에 차단된다.
- [ ] Audit record는 operation type, status, diagnostic code, masked reference만 포함한다.

## 9. Diagnostics Remediation Workflow

- [ ] Diagnostic item은 code, severity, scope에 허용된 remediation action만 노출한다.
- [ ] Critical risk diagnostic은 apply remediation action을 노출하지 않는다.
- [ ] Missing repository diagnostic은 Set Main Repository로 연결될 수 있다.
- [ ] Backup diagnostic은 backup lifecycle use case를 통해서만 Compare Backup, Restore Backup, Delete Backup으로 연결된다.
- [ ] Remediation action은 delete, restore, move, promote, overwrite confirmation을 우회하지 못한다.
- [ ] Remediation action 완료 후 Diagnostics가 refresh되며 persisted analysis가 예기치 않게 사라지지 않는다.

## 10. Watcher Refresh와 Runtime Recomposition

- [ ] Manual refresh가 source, applied, backup, repository index, Diagnostics read model을 보존한다.
- [ ] Main Repository file change 이후 watcher refresh가 refresh use case를 거치며 tree array를 직접 mutate하지 않는다.
- [ ] watcher refresh가 Diagnostics와 stale analysis state를 보존한다.
- [ ] Runtime recomposition이 settings와 workspace roots를 1회 읽고 새 RuntimeContext를 만든 뒤 기존 watcher를 dispose한다.
- [ ] settings 또는 workspace recomposition 이후 duplicate watcher registration이 발생하지 않는다.
- [ ] Field Debug detail은 기본 비활성화 상태이며 Product Log output에 표시되지 않는다.

## 11. 문서와 Release Gate

- [ ] README가 setup, import/install, apply/remove, backup/copy/move/promote, sync, diagnostics, troubleshooting을 설명한다.
- [ ] README가 `code`를 사용할 수 없을 때 처리 방법을 설명한다.
- [ ] README가 Codex 또는 Claude session이 global skills를 다시 scan하는 방법을 설명한다.
- [ ] README가 Main Repository를 active Global Target으로 설명하지 않는다.
- [x] `npm run release:gate`가 tests, architecture, manifest, build, smoke checklist를 확인한다.
- [x] `npm run package:vsix-candidate`는 local `node_modules/.bin/vsce`가 있을 때만 `.dist/` 아래 local `.vsix`를 생성한다.
- [x] `PackagingToolMissing`은 VSIX publishing failure가 아니라 조치 가능한 local packaging skip으로 처리된다.
- [x] `Release VSIX` GitHub Actions workflow는 `v` prefix tag push를 기준으로 `.vsix`를 빌드한다.
- [x] `v0.1.1` 같은 release tag는 `package.json` version과 일치할 때 `.vsix`를 GitHub Release asset으로 등록한다.
- [x] `v0.1.1a` 같은 build-only tag는 `package.json` version과 일치할 때 `.vsix` workflow artifact만 만들고 GitHub Release 등록을 건너뛴다.
- [x] release tag는 `VSCE_PAT` GitHub Actions secret을 환경 변수로만 전달하여 검증된 동일 `.vsix`를 VS Code Marketplace에 게시한다.
- [x] build-only tag는 VS Code Marketplace 게시 단계를 건너뛰며 `VSCE_PAT`를 수신하지 않는다.
- [x] GitHub tag가 release tag 또는 build-only tag 규칙과 일치하지 않으면 workflow가 실패한다.
- [x] Release gate failure code는 machine-readable 상태를 유지한다.
- [x] Phase 004 local release candidate readiness에는 VSIX publishing이 필요하지 않다.
