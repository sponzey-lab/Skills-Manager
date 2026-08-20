# Phase 004 확장 호스트 수동 검증 기록

이 템플릿은 현재 Phase 004 로컬 릴리스 후보에 대해 VSCode Extension Development Host 수동 검증 결과를 기록하기 위한 문서다. secret, token, 사용자 파일 전문, 전체 stack trace, 마스킹되지 않은 private path를 기록하지 않는다.

## 1. 검증 세션

- 날짜: 2026-07-24
- 검증자: Codex (자동 검증 및 Extension Development Host 화면 확인)
- 상태: completed
- 결과: pass
- 범위: 기존 Codex·Claude 스킬 발견과 부분 실패 회귀

허용 상태 값:

- completed
- blocked
- skipped

## 2. 환경

- 운영체제: macOS arm64
- VSCode version: 1.130.0
- Extension Development Host 실행 명령: `scripts/run-vscode-extension-host.sh <masked-fixture-workspace>`
- 사용한 Main Repository path: `/tmp` 아래 격리 fixture
- Workspace mode: folder
- 확인한 agent client: Codex, Claude

Path 기록 규칙:

- 가능하면 path category 또는 masked path만 기록한다.
- secret, token, private repository content, full skill body text를 기록하지 않는다.

## 3. 실행 명령

수동 smoke 전에 실행한 자동 검증 명령:

```text
npm test
npm run build
npm run check:vsix-candidate
npm run release:gate
```

`node_modules/.bin/vsce`가 이미 있을 때만 실행하는 선택적 local package 명령:

```text
npm run package:vsix-candidate
```

Extension Host 실행 명령:

```text
scripts/run-vscode-extension-host.sh
```

`code`를 사용할 수 없으면 사용자에게 표시된 실패 문구와 `CODE_BIN` 사용 여부를 기록한다.

## 4. 체크리스트 결과 요약

- 자동 검증: pass (`npm test`, architecture, manifest, build)
- 확장 개발 호스트: pass
- 리포지토리 설정: pass
- 리포지토리 인덱스와 버전 관리:
- Main Repository 스킬 생명주기:
- Global 및 Project 적용: pass (두 client의 기존 global/project fixture 표시)
- Diagnostics와 Analysis: pass (broken symlink와 잘못된 metadata가 정상 항목과 함께 유지)
- 백업 전송과 안전성:
- Diagnostics Remediation Workflow:
- Watcher Refresh와 Runtime Recomposition:
- Existing Skill Discovery와 Partial Failure: pass
- 문서와 Release Gate: pass

사용할 결과 값:

- pass
- fail
- blocked
- not run

## 5. 실패 또는 차단 항목

실패하거나 차단된 체크리스트 항목마다 다음을 기록한다.

- 체크리스트 섹션:
- 항목:
- 관찰 결과:
- 기대 결과:
- Diagnostic code 또는 command id:
- 증거 메모:
- 후속 task:

`SKILL.md` 전문, raw secret, raw token, 전체 stack trace, 마스킹되지 않은 customer path를 붙여넣지 않는다.

## 6. 검증 증거 메모

완료한 확인 항목의 간단한 증거를 기록한다.

- Activity Bar와 view visibility: Sponzey Skills의 네 view가 Extension Host에 표시됨.
- Main Repository setup:
- Apply/remove behavior: capability 명령 후보는 자동 Presentation 테스트로 검증함.
- Diagnostics and remediation behavior: warning group과 손상 항목을 확인했고, 다음 행동 문구는 tree model 테스트로 검증함.
- Backup compare/restore/delete behavior:
- Runtime refresh behavior:
- Existing skill discovery: 격리 fixture에서 Codex·Claude global 및 project 스킬과 각 client 배지를 동시에 확인함.
- Partial failure behavior: broken symlink와 잘못된 metadata가 있어도 정상 Codex·Claude 스킬이 유지되는 것을 확인함. target root 실패는 Application 부분 성공 테스트로 검증함.
- Compatibility behavior: 명시적으로 등록한 `.codex/skills`의 discovery-only capability와 apply/remove/move/restore 후보 제외를 자동 테스트로 검증함.
- Release gate output: 이 변경의 필수 자동 명령은 모두 통과함.

Screenshot은 private path, secret, token, user file content를 노출하지 않을 때만 파일명으로 참조한다.

## 7. 릴리스 판단

- 판단: ready
- release candidate 전 필수 후속 작업: 없음
- 연기 항목: 없음
- 검증자 메모: 실제 사용자 스킬 경로는 수정하지 않았으며 수동 fixture는 `/tmp`에 격리했다.

## 8. Global enrollment 확장 재검증 (2026-08-19)

- 상태: blocked
- 자동 검증: pass (`npm test` 393, `npm run build`, `npm run check:manifest`, `git diff --check`, `npm run release:gate`)
- Extension Host 실행: `SKIP_BUILD=1 scripts/run-vscode-extension-host.sh <workspace>`로 새 VSCode 창을 열었다.
- 차단 원인: 해당 창의 macOS accessibility tree가 workbench content를 노출하지 않아 command palette와 Sponzey Activity Bar를 신뢰성 있게 조작하거나 관찰할 수 없었다. 기존 이 문서의 수동 결과는 이전 scope의 evidence이며 새 enrollment/composite-icon flow의 pass 증거로 사용하지 않는다.
- 미확인 항목: multi-client aggregate AI icon, 우클릭 Global enrollment apply/remove, cleanup/source-only의 실제 host refresh, Codex 새 session 재탐색.
- 후속: 접근 가능한 Extension Development Host에서 `docs/release-smoke.md` §6의 새 항목을 실행하고 이 절을 `completed`/`pass`로 갱신한다.

허용 판단 값:

- ready
- blocked
- defer
