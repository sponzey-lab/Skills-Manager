# Sponzey Skills Manager 프로젝트 정의

작성일: 2026-06-28

## 1. 프로젝트 개요

Sponzey Skills Manager는 Agent Skills를 만들고, 보관하고, 분석하고, 전역 또는 프로젝트별 실행 위치에 적용하는 VSCode Extension이다. 이 도구는 사용자의 모든 스킬을 하나의 로컬 메인 스킬 리포지토리에 체계적으로 보관하되, 해당 리포지토리를 전역 스킬 적용 위치로 취급하지 않는다.

즉 메인 스킬 리포지토리는 "스킬 원본을 관리하는 라이브러리"이고, 실제 agent가 읽는 전역 또는 프로젝트별 스킬 디렉터리는 "적용 대상"이다. 사용자는 메인 리포지토리의 스킬을 전역 스킬 위치나 특정 프로젝트 스킬 위치에 심링크 또는 실제 복사 방식으로 배치할 수 있다.

이 프로젝트의 핵심 목표는 다음 세 가지다.

1. 스킬을 안전하고 일관된 방식으로 보관한다.
2. 스킬을 전역 또는 프로젝트별로 명확하게 적용하고 제거한다.
3. 스킬 내용을 분석하여 위험한 스킬, 잘못된 스킬, 과도한 권한을 요구하는 스킬을 사전에 발견한다.
4. 이미 전역 또는 프로젝트에 적용되어 있는 스킬을 메인 스킬 리포지토리로 복사, 이동, 백업할 수 있게 한다.

## 2. 배경과 문제 정의

Agent Skills는 `SKILL.md`와 관련 파일을 포함하는 폴더형 지식 패키지다. Codex, Claude Code, OpenAI API, 기타 agent runtime은 각자 정해진 위치에서 스킬을 발견하고 실행 컨텍스트에 포함한다. 그러나 스킬을 여러 프로젝트와 전역 환경에서 사용하다 보면 다음 문제가 생긴다.

- 같은 스킬이 여러 위치에 복사되어 버전이 달라진다.
- 어떤 프로젝트에 어떤 스킬이 적용되어 있는지 알기 어렵다.
- 전역 스킬과 프로젝트 스킬이 충돌하거나 의도하지 않게 shadowing된다.
- 외부에서 받은 스킬이 shell 실행, 파일 쓰기, 네트워크 접근, MCP 도구 호출 등을 요구해도 사용자가 위험도를 파악하기 어렵다.
- 스킬 삭제가 원본 삭제인지 적용 해제인지 헷갈린다.
- 이미 전역 또는 프로젝트에 설치된 스킬을 안전하게 메인 리포지토리로 회수하거나 백업하기 어렵다.
- Codex의 `.agents/skills`, Claude의 `.claude/skills` 등 client별 위치와 규칙이 달라 수동 관리가 번거롭다.

Sponzey Skills Manager는 이 문제를 해결하기 위해 "원본 저장소"와 "적용 위치"를 분리한다. 사용자는 스킬 원본을 메인 리포지토리에서 관리하고, 필요한 대상에만 선택적으로 적용한다.

## 3. 제품 정의

### 3.1 한 문장 정의

Sponzey Skills Manager는 로컬 메인 스킬 리포지토리를 기준으로 Agent Skills를 보관, 분석, 적용, 제거하는 VSCode Extension이다.

### 3.2 제품 형태

- 배포 형태: VSCode Extension
- 실행 환경: VSCode Desktop 우선
- 관리 대상: Agent Skills 디렉터리
- 기본 스킬 포맷: `SKILL.md` 기반 폴더형 스킬
- 기본 원본 저장소: 사용자가 지정한 로컬 디렉터리
- 기본 적용 대상:
  - 전역 스킬 디렉터리
  - 현재 VSCode workspace 또는 선택한 프로젝트의 스킬 디렉터리

### 3.3 핵심 사용자

- Codex, Claude Code, 기타 agent 도구에서 여러 스킬을 사용하는 개발자
- 팀 단위로 공통 스킬을 만들고 프로젝트별로 적용하려는 개발자
- 외부 스킬을 가져오기 전에 위험도와 구조를 검토하려는 사용자
- 로컬 스킬 라이브러리를 체계적으로 관리하려는 사용자

## 4. 핵심 원칙

### 4.1 메인 스킬 리포지토리는 원본 저장소다

메인 스킬 리포지토리는 모든 스킬의 기본 저장 위치다. 사용자가 새 스킬을 만들거나 외부 스킬을 가져오면 기본적으로 이 리포지토리에 저장한다.

하지만 메인 스킬 리포지토리는 agent가 자동으로 읽는 전역 스킬 디렉터리로 간주하지 않는다. 이것은 매우 중요한 정책이다.

예를 들어 사용자가 메인 리포지토리를 다음 위치로 지정했다고 가정한다.

```text
~/SponzeySkills
```

이 디렉터리는 스킬 원본을 보관하는 곳일 뿐이다. Codex가 전역 스킬로 읽는 위치인 다음 경로와는 개념적으로 다르다.

```text
~/.agents/skills
```

따라서 `~/SponzeySkills/code-reviewer`라는 스킬이 존재하더라도, 사용자가 명시적으로 전역 또는 프로젝트에 적용하지 않았다면 agent가 해당 스킬을 사용할 수 있다고 가정하지 않는다.

### 4.2 적용은 명시적이어야 한다

스킬은 메인 리포지토리에 존재하는 것만으로 활성화되지 않는다. 사용자는 다음 작업 중 하나를 명시적으로 수행해야 한다.

- 전역에 적용
- 현재 프로젝트에 적용
- 선택한 프로젝트 경로에 적용

이 원칙은 의도하지 않은 스킬 노출과 자동 실행 위험을 줄인다.

전역 적용의 명시 동작은 하나의 target을 고르는 것이 아니라 `Global enrollment`를 생성하는 것이다. enrollment가 생성된 뒤에는 현재와 이후에 등록되는 applyable Global target에 같은 managed source를 조정할 수 있다. 이는 최초 사용자의 명시적 의도를 따르는 후속 동작이며, Project target에는 적용하지 않는다.

### 4.2.1 적용 목록 통합 표시

Global Skills와 Project Skills는 target 폴더별 목록이 아니라 스킬 정체성별 aggregate row를 표시한다.

- managed placement는 stable `sourceId`가 같을 때만 한 행으로 합친다.
- external placement는 정규화한 이름과 target root 안에서 읽은 content hash가 모두 같을 때만 합친다.
- hash를 읽지 못하거나 target root 밖으로 해석되는 external은 절대 이름만으로 합치지 않고 Diagnostics와 별도 행으로 남긴다.
- Main Repository, Global Skills, Project Skills의 스킬 행은 왼쪽 아이콘을 표시하지 않으며, 스킬 이름의 왼쪽 기준선을 동일하게 맞춘다. Global aggregate row는 target child를 만들지 않는 HTML 목록으로 표시한다. AI client SVG image는 스킬 이름 오른쪽에 표시하며, 알려진 AI는 전용 image를, 그 외 AI는 공통 generic image를 사용한다. managed Global row의 우클릭 `Remove Global Skill Enrollment`는 enrollment와 모든 managed Global placement를 해제한다.
- broken symlink는 active Global/Project row가 아니라 Diagnostics repair/remove 흐름으로만 표시한다.

### 4.3 삭제와 적용 해제는 구분한다

스킬 관리는 최소 세 가지 삭제 동작을 구분해야 한다.

| 동작        | 의미                        | 원본 스킬 영향 |
| --------- | ------------------------- | -------- |
| 적용 해제     | 전역 또는 프로젝트 대상에서 스킬 연결만 제거 | 원본 유지    |
| 대상 복사본 삭제 | 적용 대상에 복사된 스킬 파일 삭제       | 원본 유지    |
| 원본 삭제     | 메인 스킬 리포지토리에서 스킬 자체 삭제    | 원본 삭제    |

UI는 이 세 동작을 절대 혼동하지 않도록 표현해야 한다. 특히 "Delete"라는 단일 명령만 제공하면 위험하므로, 다음처럼 목적이 드러나는 명령명을 사용한다.

- Remove from Global
- Remove from Project
- Delete from Main Repository
- Delete Applied Copy

### 4.4 심링크와 복사는 사용자가 선택한다

메인 리포지토리의 스킬을 적용 위치로 배치하는 방식은 두 가지를 지원한다.

| 방식      | 설명                             | 장점                | 단점                  |
| ------- | ------------------------------ | ----------------- | ------------------- |
| Symlink | 적용 위치에 원본 스킬 디렉터리를 가리키는 심링크 생성 | 업데이트 즉시 반영, 중복 없음 | 경로 이동/권한/플랫폼 이슈     |
| Copy    | 적용 위치에 실제 파일 복사                | 독립적이고 이식성 좋음      | 원본 업데이트가 자동 반영되지 않음 |

기본값은 사용자 설정으로 정할 수 있어야 한다. 프로젝트별로도 선택할 수 있어야 하며, 이미 적용된 스킬의 배치 방식이 무엇인지 목록에서 확인 가능해야 한다.

### 4.5 분석이 적용보다 앞서야 한다

외부에서 가져온 스킬이나 아직 신뢰하지 않은 스킬은 적용 전에 분석 결과를 보여줘야 한다. 분석은 스킬 사용을 막기 위한 기능만이 아니라, 사용자가 스킬의 동작 범위와 위험을 이해하도록 돕는 기능이다.

### 4.6 적용된 스킬은 메인 리포지토리로 회수할 수 있어야 한다

전역 또는 프로젝트에 이미 존재하는 스킬은 메인 스킬 리포지토리로 복사, 이동, 백업할 수 있어야 한다. 이는 외부에서 수동으로 설치한 스킬, 과거에 다른 도구가 생성한 스킬, Sponzey 관리 밖에서 수정된 복사본을 메인 리포지토리의 원본 관리 체계로 편입하기 위한 기능이다.

이 기능은 세 가지 동작을 구분한다.

| 동작                        | 의미                          | target 영향                     | 메인 리포지토리 영향                 |
| ------------------------- | --------------------------- | ----------------------------- | --------------------------- |
| Copy to Main Repository   | 전역/프로젝트 스킬을 메인 리포지토리에 복사    | target 유지                     | 새 원본 생성 또는 기존 원본 업데이트 후보 생성 |
| Move to Main Repository   | 전역/프로젝트 스킬을 메인 리포지토리로 이동    | target 제거 또는 managed link로 전환 | 새 원본 생성                     |
| Backup to Main Repository | 전역/프로젝트 스킬의 현재 상태를 백업본으로 저장 | target 유지                     | timestamp가 포함된 백업 원본 생성     |

기본적으로는 `Copy to Main Repository` 또는 `Backup to Main Repository`가 안전하다. `Move to Main Repository`는 target에서 실제 항목을 제거할 수 있으므로 명시적인 확인이 필요하다.

## 5. 주요 개념

### 5.1 Skill

스킬은 하나의 디렉터리이며, 최소한 `SKILL.md`를 포함한다.

```text
code-reviewer/
  SKILL.md
  references/
  scripts/
  assets/
```

`SKILL.md`는 이름, 설명, 사용 조건, 절차, 도구 의존성, 보안 제한 등을 포함할 수 있다.

### 5.2 Main Skill Repository

메인 스킬 리포지토리는 Sponzey Skills Manager가 원본 스킬을 저장하는 로컬 디렉터리다.

예시:

```text
~/SponzeySkills
  code-reviewer/
  pr-description-writer/
  flutter-ui-auditor/
```

이 디렉터리는 전역 적용 위치가 아니다. Sponzey Skills Manager 내부에서만 "스킬 원본 라이브러리"로 해석한다.

### 5.3 Applied Skill

적용된 스킬은 메인 리포지토리의 스킬이 전역 또는 프로젝트 스킬 디렉터리에 배치된 상태를 의미한다.

예시:

```text
~/.agents/skills/code-reviewer -> ~/SponzeySkills/code-reviewer
```

또는 복사 방식:

```text
~/.agents/skills/code-reviewer/
  SKILL.md
  references/
```

### 5.4 Global Skill Target

전역 스킬 대상은 특정 agent client가 전역 스킬로 인식하는 위치다.

예시:

```text
~/.agents/skills
~/.claude/skills
```

Sponzey Skills Manager는 전역 대상을 여러 개 지원할 수 있어야 한다. 예를 들어 Codex 전역과 Claude 전역은 다른 경로를 사용할 수 있다.

### 5.5 Project Skill Target

프로젝트 스킬 대상은 특정 프로젝트 내부에 있는 스킬 적용 위치다.

예시:

```text
<project>/.agents/skills
<project>/.claude/skills
```

VSCode Extension이므로 기본 프로젝트 대상은 현재 열린 workspace root다. multi-root workspace에서는 사용자가 대상 root를 선택할 수 있어야 한다.

### 5.6 Skill Source와 Skill Target

Sponzey Skills Manager는 source와 target을 명확히 구분한다.

- Source: 메인 리포지토리에 있는 원본 스킬
- Target: 전역 또는 프로젝트에 적용된 스킬 위치

같은 스킬 이름이라도 source와 target의 상태가 다를 수 있다.

## 6. 지원할 스킬 위치

### 6.1 메인 리포지토리

사용자가 설정하는 로컬 디렉터리다.

권장 기본값:

```text
~/SponzeySkills
```

다만 실제 기본값은 extension 설정에서 변경 가능해야 한다.

### 6.2 Codex 호환 위치

Codex 계열 스킬은 다음 위치를 대상으로 한다.

```text
~/.agents/skills
<workspace>/.agents/skills
```

### 6.3 Claude 호환 위치

Claude Code 계열 스킬은 다음 위치를 대상으로 한다.

```text
~/.claude/skills
<workspace>/.claude/skills
```

### 6.4 사용자 정의 대상

미래 확장을 위해 사용자가 직접 target path를 등록할 수 있어야 한다.

Codex의 표준 검색 위치는 `.agents/skills`다. `.codex/skills`는 표준 위치로
자동 등록하지 않는다. 사용자가 기존 자료 이관을 위해 명시적으로 등록한
`.codex/skills` target은 `compatibility` origin으로 구분하고 조회, Main
Repository 복사, 백업만 허용한다. 적용, 적용 해제, 이동, 복원 후보에서는
제외한다.

표준 target 디렉터리가 없으면 빈 목록으로 처리한다. 한 target 또는 그 안의
항목 하나를 읽을 수 없으면 정상 target의 결과를 유지하고 Diagnostics에
위치, 영향, 다음 행동을 표시한다.

예시:

```text
~/custom-agent/skills
~/work/company-agent/skills
```

사용자 정의 대상은 client type을 `custom`으로 저장한다.

## 7. 주요 기능 요구사항

### 7.1 메인 스킬 리포지토리 설정

사용자는 VSCode 설정 또는 초기 온보딩 화면에서 메인 스킬 리포지토리 경로를 지정할 수 있어야 한다.

필수 동작:

- 경로 선택
- 경로 생성
- 기존 디렉터리 사용
- 유효성 검사
- 권한 검사
- `SKILL.md` 기반 스킬 자동 인덱싱

유효성 검사 항목:

- 디렉터리가 존재하는가
- 읽기/쓰기 가능한가
- 스킬 디렉터리 구조를 포함하는가
- 너무 위험한 경로인가
  - 예: `/`, `~`, workspace root 자체, system directory

주의: 메인 스킬 리포지토리를 `~/.agents/skills` 같은 실제 전역 스킬 위치로 설정하는 것은 경고해야 한다. 설정 자체를 완전히 금지할지 여부는 정책으로 정해야 하지만, 기본 UX는 강하게 막는 쪽이 안전하다.

### 7.2 메인 리포지토리 스킬 목록

메인 리포지토리에 있는 모든 스킬을 목록으로 확인할 수 있어야 한다.

목록 컬럼:

- 스킬 이름
- 설명
- 상태
- 위험도
- 버전 또는 수정일
- 적용 상태
- 적용 대상 수
- 배치 방식
- 호환 client

상태 예시:

- Valid
- Warning
- Invalid
- Unanalyzed
- External Change Detected

위험도 예시:

- Low
- Medium
- High
- Critical

목록에서 가능한 작업:

- 상세 보기
- 분석 실행
- 전역에 적용
- 프로젝트에 적용
- 원본 열기
- `SKILL.md` 열기
- 원본 삭제
- zip export

### 7.3 전역 스킬 목록

전역 스킬 위치에 적용된 스킬 목록을 확인할 수 있어야 한다.

현재 UI는 target 폴더 group을 추가하지 않고 각 스킬 행에 client 배지를
표시한다.

예시:

- Codex Global: `~/.agents/skills`
- Claude Global: `~/.claude/skills`
- Custom Global Targets

각 항목에서 표시할 정보:

- 스킬 이름
- 실제 경로
- 원본 연결 여부
- 심링크 여부
- 복사본 여부
- 메인 리포지토리와 동기화 상태
- 위험도
- 충돌 여부
- 마지막 분석 시각

전역 목록에서 가능한 작업:

- 메인 리포지토리 원본으로 이동
- 적용 해제
- 복사본 업데이트
- 심링크 재생성
- 분석 실행
- target folder 열기

### 7.4 프로젝트별 스킬 목록

현재 VSCode workspace 또는 선택한 프로젝트에 적용된 스킬 목록을 확인할 수 있어야 한다.

multi-root workspace에서는 root별로 분리 표시한다.

예시:

```text
Workspace: mobile-app
  .agents/skills
    flutter-ui-auditor
    release-note-writer

Workspace: backend-api
  .agents/skills
    sql-reviewer
    api-contract-checker
```

프로젝트별 목록에서 가능한 작업:

- 프로젝트에 적용된 스킬 확인
- 메인 리포지토리와 연결 상태 확인
- 프로젝트에서 적용 해제
- 복사본 업데이트
- 프로젝트별 충돌 확인
- 프로젝트의 `.agents/skills` 또는 `.claude/skills` 열기

### 7.5 스킬 적용

사용자는 메인 리포지토리의 스킬을 전역 또는 프로젝트에 적용할 수 있어야 한다.

적용 대상:

- Codex 전역
- Claude 전역
- 현재 workspace Codex 프로젝트
- 현재 workspace Claude 프로젝트
- 선택한 프로젝트 경로
- 사용자 정의 target

적용 방식:

- Symlink
- Copy

Global enrollment:

- 사용자가 전역 적용을 명시하면 source identity, 기본 apply mode, Global enrollment lifecycle을 저장한다.
- enrollment는 현재 applyable Global target 전체를 조정하고, 설정 재구성 또는 새 Global target 등록 후 누락 placement만 멱등 적용한다.
- 기존 managed Global placement는 source와 target 파일을 변경하지 않고 하나의 enrollment로 이관한다.
- target별 성공과 실패를 구분해 보존하고, 실패가 성공 placement를 rollback하거나 Project target에 적용하게 하지 않는다.
- Global 해제는 enrollment와 managed Global placement만 제거하며 source, Project placement, external target은 보존한다.

적용 전 확인:

- 대상에 같은 이름의 스킬이 이미 있는가
- 대상 스킬이 Sponzey가 관리한 것인가
- 기존 항목이 심링크인가 실제 폴더인가
- 기존 항목이 메인 리포지토리의 다른 스킬을 가리키는가
- 기존 항목이 외부에서 만든 스킬인가
- 분석 결과가 High 또는 Critical인가

충돌 처리 정책:

| 상황                | 기본 동작                        |
| ----------------- | ---------------------------- |
| 대상에 같은 이름 없음      | 적용                           |
| 대상에 같은 원본 심링크 존재  | no-op 또는 재검증                 |
| 대상에 같은 이름의 복사본 존재 | 업데이트 확인                      |
| 대상에 다른 원본 심링크 존재  | 충돌 경고                        |
| 대상에 외부 폴더 존재      | 덮어쓰기 금지, import 또는 backup 제안 |
| 분석 결과 Critical    | 기본 적용 차단                     |

### 7.6 스킬 적용 해제

적용 해제는 target에서 스킬을 제거하는 작업이며, 메인 리포지토리 원본을 삭제하지 않는다.

심링크 적용 해제:

- target의 심링크만 삭제한다.
- 원본 디렉터리는 유지한다.

복사 적용 해제:

- target의 복사본 디렉터리를 삭제한다.
- 원본 디렉터리는 유지한다.
- 사용자가 target 복사본을 수정했을 가능성이 있으면 경고한다.

외부 스킬 적용 해제:

- Sponzey가 관리하지 않는 외부 스킬은 기본적으로 삭제하지 않는다.
- 사용자가 명시적으로 "Delete external target folder"를 선택할 때만 삭제한다.

### 7.7 스킬 가져오기, 백업, 이동

외부 폴더, zip, 현재 프로젝트의 기존 스킬, 전역 스킬 위치의 기존 스킬을 메인 리포지토리로 가져올 수 있어야 한다. 또한 전역 또는 프로젝트에 이미 적용되어 있는 스킬을 메인 리포지토리로 복사, 이동, 백업할 수 있어야 한다.

지원 입력:

- 로컬 디렉터리
- zip 파일
- 현재 workspace의 `.agents/skills/<name>`
- 현재 workspace의 `.claude/skills/<name>`
- 전역 스킬 위치의 기존 스킬
- 전역 target에 있는 Sponzey managed skill
- 전역 target에 있는 external skill
- 프로젝트 target에 있는 Sponzey managed skill
- 프로젝트 target에 있는 external skill

가져오기와 백업 방식:

- 메인 리포지토리에 복사
- 메인 리포지토리로 이동
- 메인 리포지토리에 백업본 생성
- 이름 충돌 시 rename
- 기존 원본이 있을 경우 overwrite, create copy, create backup 중 선택
- 가져오기 후 분석 실행
- 원본 출처 metadata 기록
- 원본 target path와 client type 기록
- target이 symlink였는지 copy였는지 external folder였는지 기록

복사, 이동, 백업의 차이:

| 방식     | 사용 상황                                     | 동작                                                         |
| ------ | ----------------------------------------- | ---------------------------------------------------------- |
| Copy   | target의 현재 스킬을 원본 후보로 편입하고 싶을 때           | target은 그대로 두고 메인 리포지토리에 동일한 스킬을 복사                        |
| Move   | target에만 있던 스킬을 메인 리포지토리 중심 관리로 전환하고 싶을 때 | 메인 리포지토리에 복사한 뒤 target 항목을 제거하거나 managed symlink/copy로 재적용 |
| Backup | target의 현재 상태를 보존하고 싶을 때                  | 메인 리포지토리의 backup 영역 또는 이름이 변경된 스킬 디렉터리에 snapshot 저장        |

권장 백업 저장 방식:

```text
<main-skill-repository>/
  backups/
    2026-06-28T153000/
      global-codex-code-reviewer/
        SKILL.md
      project-mobile-app-flutter-ui-auditor/
        SKILL.md
```

또는 메인 리포지토리의 일반 스킬 목록에 편입할 경우:

```text
<main-skill-repository>/skills/code-reviewer__backup_20260628_153000/
```

MVP에서는 두 방식 중 하나를 선택해 일관되게 구현한다. 기본 권장안은 `backups/` 아래에 snapshot을 저장하고, 사용자가 원할 때 정식 스킬로 승격하는 방식이다.

이동 처리 정책:

| 상황                              | 기본 동작                                   |
| ------------------------------- | --------------------------------------- |
| target이 external folder         | 메인 리포지토리로 복사 후 target 제거 여부 확인          |
| target이 Sponzey managed copy    | target 수정 여부 확인 후 메인 리포지토리에 병합 또는 백업    |
| target이 Sponzey managed symlink | 원본이 이미 메인 리포지토리에 있으면 move 불필요, no-op 처리 |
| target이 broken symlink          | link path 기록 후 target 제거 또는 백업 불가 진단    |
| 같은 이름의 원본이 이미 존재                | overwrite 금지, rename 또는 backup 생성 제안    |

백업은 destructive action이 아니어야 한다. 백업 명령은 target을 변경하지 않고 메인 리포지토리에 snapshot만 남긴다.

### 7.8 스킬 생성

VSCode 명령으로 새 스킬을 만들 수 있어야 한다.

필수 입력:

- 스킬 이름
- 설명
- 호환 client
- 초기 템플릿

생성 결과:

```text
<main-skill-repository>/<skill-name>/
  SKILL.md
```

선택 생성:

```text
references/
scripts/
assets/
```

생성 직후에는 메인 리포지토리에만 존재한다. 전역 또는 프로젝트에 자동 적용하지 않는다.

### 7.9 스킬 편집

스킬 상세 화면에서 `SKILL.md`와 관련 파일을 열 수 있어야 한다.

권장 편집 기능:

- frontmatter form editor
- markdown editor
- description 품질 검사
- references 파일 목록
- scripts 파일 목록
- 위험 요소 하이라이트

MVP에서는 VSCode 기본 editor로 파일을 여는 방식만으로도 충분하다. 이후 custom webview editor를 추가할 수 있다.

### 7.10 스킬 분석

스킬 분석은 Sponzey Skills Manager의 핵심 기능이다. 분석은 정적 분석 중심으로 시작하고, 필요하면 이후 동적 검사 또는 sandbox 실행 검사를 추가한다.

분석 대상:

- `SKILL.md`
- frontmatter
- markdown 본문
- `scripts/`
- `references/`
- `assets/`
- `agents/openai.yaml`
- 기타 metadata 파일

분석 결과:

- 구조 유효성
- 설명 품질
- 호환성
- 권한 요구
- 위험 패턴
- 의존성
- 충돌 가능성
- 적용 권장 여부

위험 신호 예시:

- shell 명령 실행 지시
- `rm`, `curl | sh`, credential 출력, home directory 전체 탐색
- secret, token, API key 접근 요청
- network upload/download 지시
- MCP tool을 통한 외부 시스템 변경
- `allowed-tools`가 과도하게 넓음
- description이 너무 일반적이어서 자동 호출 위험이 큼
- prompt injection 패턴
- 보안 정책 우회 지시
- 사용자 확인 없이 destructive action을 수행하라는 지시

분석 결과는 단순 점수보다 구체적인 진단 목록으로 보여줘야 한다.

분석은 실행·네트워크·sandbox 없이 정적으로 수행한다. `SKILL.md`와 허용된 text artifact는 source당 최대 2,000개, 깊이 16, artifact당 1 MiB, 총 32 MiB 안에서만 읽고 symlink는 따라가지 않는다. 초과·binary·encoding 오류는 안전 판정이 아니라 coverage gap으로 표시한다.

finding은 검증된 `confirmed`와 상관관계 기반 `potential`을 구분한다. confirmed Critical만 기본 적용을 차단한다. potential 단일 신호는 최대 Medium·비차단이고, 독립 signal family가 상관될 때만 High 확인을 요구한다. Diagnostics는 confidence, impact, 상대 파일 위치와 안전한 요약만 표시하며 raw skill body, secret, raw match, URL query, 절대경로를 저장하거나 표시하지 않는다.

예시:

```text
Risk: High

Diagnostics
- HIGH: scripts/install.sh contains curl-to-shell pattern.
- MEDIUM: description is too broad and may trigger unexpectedly.
- LOW: references/security.md is mentioned but missing.
```

### 7.11 스킬 동기화 상태 확인

심링크 방식은 원본과 target이 항상 연결되어 있으므로 별도 동기화가 필요 없다. 다만 심링크가 깨졌는지 확인해야 한다.

복사 방식은 원본과 target이 달라질 수 있으므로 동기화 상태를 표시해야 한다.

상태 예시:

- In Sync
- Source Changed
- Target Changed
- Both Changed
- Missing Source
- Missing Target
- Broken Symlink
- External

복사 방식의 동기화 판단:

- 파일 목록 비교
- 파일 hash 비교
- 수정 시각 비교
- Sponzey metadata 비교

### 7.12 스킬 삭제

삭제는 두 레벨로 분리한다.

1. 메인 리포지토리에서 원본 삭제
2. 전역/프로젝트 target에서 적용 항목 삭제

원본 삭제 전 확인해야 할 사항:

- 전역에 적용되어 있는가
- 어떤 프로젝트에 적용되어 있는가
- 심링크 target이 남게 되는가
- 복사본 target은 유지할 것인가 삭제할 것인가
- 삭제 백업을 만들 것인가

원본 삭제 정책:

- 기본적으로 원본만 삭제한다.
- 연결된 target이 있으면 경고한다.
- 심링크 target은 함께 제거할지 선택하게 한다.
- 복사본 target은 원본 삭제와 별개로 유지할 수 있다.
- 권장 cleanup은 실행 시점에 enrollment와 현재 Global/Project target을 다시 scan한 뒤, source identity가 검증된 managed placement만 target-first로 제거하고 재-scan으로 부재를 확인한 후 원본을 삭제한다.
- 같은 이름의 external target은 cleanup 대상이 아니며, stale UI count나 과거 target path는 삭제 대상 판정에 사용하지 않는다.
- cleanup 중 target 제거 또는 검증이 실패하면 source를 보존하고 enrollment를 `deletion-pending` 상태와 남은 placement로 저장해 재시도한다.
- source-only 삭제는 명시 선택으로만 허용하며 enrollment를 비활성화한다. copy는 client에 남고 symlink는 broken이 될 수 있음을 결과에 표시한다.
- 파일시스템 cleanup이 성공해도 이미 실행 중인 Codex 등의 client cache를 강제로 변경하지 말고 새 세션 또는 재시작이 필요할 수 있음을 안내한다.

## 8. VSCode Extension UX 설계

### 8.1 Activity Bar

Extension은 Activity Bar에 "Skills" 또는 "Sponzey Skills" 아이콘을 제공한다.

주요 View:

- Main Repository
- Global Skills
- Project Skills
- Diagnostics
- Settings

### 8.2 Tree View 구조

현재 Tree View:

```text
Sponzey Skills
  Main Repository
    code-reviewer
    flutter-ui-auditor
    release-note-writer

  Global Skills
    [Codex] code-reviewer
    [Claude] release-note-writer

  Project Skills
    [Codex · .agents/skills] flutter-ui-auditor

  Diagnostics
    warning
      target
        target-unavailable
      sync
        broken-symlink
```

### 8.3 Command Palette 명령

필수 명령:

```text
Sponzey Skills: Set Main Repository
Sponzey Skills: Open Main Repository
Sponzey Skills: Refresh Skills
Sponzey Skills: Create Skill
Sponzey Skills: Import Skill
Sponzey Skills: Copy Applied Skill to Main Repository
Sponzey Skills: Move Applied Skill to Main Repository
Sponzey Skills: Backup Applied Skill to Main Repository
Sponzey Skills: Analyze Skill
Sponzey Skills: Analyze All Skills
Sponzey Skills: Apply Skill Globally
Sponzey Skills: Apply Skill to Project
Sponzey Skills: Remove Skill from Global
Sponzey Skills: Remove Skill from Project
Sponzey Skills: Delete Skill from Main Repository
Sponzey Skills: Switch Apply Mode
Sponzey Skills: Show Skill Diagnostics
```

### 8.4 Context Menu

메인 리포지토리 스킬 context menu:

- Open `SKILL.md`
- Open Folder
- Analyze
- Apply to Global
- Apply to Project
- Export
- Rename
- Delete from Main Repository

전역 스킬 context menu:

- Open Target
- Open Source
- Analyze
- Copy to Main Repository
- Move to Main Repository
- Backup to Main Repository
- Update Copy from Source
- Convert to Symlink
- Convert to Copy
- Remove from Global

프로젝트 스킬 context menu:

- Open Target
- Open Source
- Analyze
- Copy to Main Repository
- Move to Main Repository
- Backup to Main Repository
- Update Copy from Source
- Remove from Project

### 8.5 상세 화면

스킬 상세 화면은 다음 정보를 보여준다.

- 이름
- 설명
- 원본 위치
- 적용 상태
- 전역 적용 여부
- 프로젝트 적용 여부
- 적용 방식
- 호환 client
- 분석 결과
- 위험도
- 파일 목록
- 의존성
- 최근 변경일

상세 화면의 주요 액션:

- Apply
- Remove
- Copy to Main Repository
- Move to Main Repository
- Backup to Main Repository
- Analyze
- Open
- Edit
- Export

## 9. 설정 설계

VSCode settings 예시:

```json
{
  "sponzeySkills.mainRepositoryPath": "~/SponzeySkills",
  "sponzeySkills.defaultApplyMode": "symlink",
  "sponzeySkills.enabledClients": ["codex", "claude"],
  "sponzeySkills.globalTargets": [],
  "sponzeySkills.projectTargetPatterns": [
    ".agents/skills",
    ".claude/skills"
  ],
  "sponzeySkills.blockCriticalRiskApply": true,
  "sponzeySkills.warnHighRiskApply": true,
  "sponzeySkills.autoAnalyzeOnImport": true,
  "sponzeySkills.autoAnalyzeOnSave": false,
  "sponzeySkills.showExternalSkills": true,
  "sponzeySkills.backupAppliedSkillsPath": "backups",
  "sponzeySkills.defaultAppliedSkillImportMode": "backup",
  "sponzeySkills.removeTargetAfterMoveToMain": false
}
```

설정 설명:

| 설정                              | 의미                                                      |
| ------------------------------- | ------------------------------------------------------- |
| `mainRepositoryPath`            | 원본 스킬을 저장하는 로컬 디렉터리                                     |
| `defaultApplyMode`              | 기본 적용 방식: `symlink` 또는 `copy`                           |
| `enabledClients`                | 관리할 agent client 목록                                     |
| `globalTargets`                 | 표준 target 외에 사용자가 명시적으로 추가한 전역 target                       |
| `projectTargetPatterns`         | 프로젝트 내부에서 스캔할 스킬 target 상대 경로                           |
| `blockCriticalRiskApply`        | Critical 위험 스킬 적용 차단 여부                                 |
| `warnHighRiskApply`             | High 위험 스킬 적용 전 경고 여부                                   |
| `autoAnalyzeOnImport`           | import 후 자동 분석                                          |
| `autoAnalyzeOnSave`             | 저장 시 자동 분석                                              |
| `showExternalSkills`            | Sponzey가 관리하지 않는 target 스킬 표시 여부                        |
| `backupAppliedSkillsPath`       | 적용된 스킬 snapshot을 저장할 메인 리포지토리 내 상대 경로                   |
| `defaultAppliedSkillImportMode` | 적용된 스킬을 메인 리포지토리로 가져올 때 기본 동작: `backup`, `copy`, `move` |
| `removeTargetAfterMoveToMain`   | move 후 기존 target 항목을 제거할지 여부                            |

## 10. 데이터 모델

### 10.1 SkillSource

메인 리포지토리에 있는 원본 스킬을 표현한다.

```text
SkillSource
- id
- name
- description
- sourcePath
- skillMdPath
- repositoryPath
- clientCompatibility
- status
- riskLevel
- diagnostics
- createdAt
- updatedAt
- lastAnalyzedAt
- originType: created | imported | copied-from-target | moved-from-target | backup-promoted
- originTargetPath
- originClientType
- originWorkspacePath
- metadata
```

### 10.2 SkillTarget

전역 또는 프로젝트 적용 위치를 표현한다.

```text
SkillTarget
- id
- name
- clientType: codex | claude | custom
- scope: global | project
- targetPath
- workspacePath
- enabled
- priority
```

### 10.3 AppliedSkill

특정 target에 적용된 스킬 상태를 표현한다.

```text
AppliedSkill
- id
- skillName
- sourceSkillId
- targetId
- targetSkillPath
- applyMode: symlink | copy | external
- linkTargetPath
- syncStatus
- managedBySponzey
- installedAt
- updatedAt
- lastCheckedAt
```

### 10.4 GlobalSkillEnrollment

명시적 Global 적용 의도와 managed Global placement의 조정 상태를 표현한다.

```text
GlobalSkillEnrollment
- sourceSkillId
- defaultApplyMode: symlink | copy
- lifecycle: active | deletion-pending
- placements[]: targetId, applyMode
- remainingCleanupPlacements[]
```

enrollment는 source와 Global target 사이의 managed 관계만 표현한다. external item, Project 자동 적용, 이름만 같은 target item은 enrollment에 포함하지 않는다.

### 10.5 SkillBackup

전역 또는 프로젝트 target에서 메인 리포지토리로 백업한 snapshot을 표현한다.

```text
SkillBackup
- id
- skillName
- backupPath
- sourceTargetId
- sourceTargetPath
- sourceScope: global | project
- sourceClientType: codex | claude | custom
- sourceWorkspacePath
- sourceApplyMode: symlink | copy | external | unknown
- backupReason
- createdAt
- sourceHash
- promotedToSkillSourceId
```

### 10.5 SkillDiagnostic

분석 결과를 표현한다.

```text
SkillDiagnostic
- id
- skillId
- severity: info | warning | high | critical
- category: structure | security | compatibility | dependency | quality | sync
- code
- message
- filePath
- line
- recommendation
```

### 10.6 SkillDependency

스킬이 요구하는 도구, MCP, script, runtime 의존성을 표현한다.

```text
SkillDependency
- id
- skillId
- type: mcp | shell | node | python | network | env | file | unknown
- name
- required
- source
- status
- details
```

### 10.7 SkillTransferOperation

전역 또는 프로젝트 target과 메인 리포지토리 사이에서 발생한 복사, 이동, 백업 작업의 감사 기록이다.

```text
SkillTransferOperation
- id
- operationType: import | copy-to-main | move-to-main | backup-to-main | promote-backup
- skillName
- sourcePath
- destinationPath
- sourceScope: main | global | project | external
- destinationScope: main | global | project | backup
- sourceTargetId
- destinationSkillSourceId
- conflictResolution: rename | overwrite | backup | skipped
- removedSourceAfterMove
- createdAt
- status: success | warning | failed
- diagnostics
```

### 10.8 RepositoryIndex

빠른 조회를 위한 로컬 인덱스다.

```text
RepositoryIndex
- version
- mainRepositoryPath
- sources
- targets
- appliedSkills
- backups
- transferOperations
- diagnostics
- lastFullScanAt
```

인덱스는 extension global storage에 저장할 수 있다. 단, 실제 truth는 파일 시스템이어야 한다. 인덱스는 캐시로 취급하고, 파일 변경 감지 또는 refresh 시 재계산해야 한다.

## 11. 파일 시스템 정책

### 11.1 메인 리포지토리 구조

권장 구조:

```text
SponzeySkills/
  skills/
    code-reviewer/
      SKILL.md
    flutter-ui-auditor/
      SKILL.md
  backups/
    2026-06-28T153000/
      global-codex-code-reviewer/
        SKILL.md
  .sponzey/
    repository.json
    index.json
```

대안 구조:

```text
SponzeySkills/
  code-reviewer/
    SKILL.md
  flutter-ui-auditor/
    SKILL.md
  .sponzey/
    repository.json
```

권장안은 `skills/` 하위에 정식 원본 스킬을 두고, `backups/` 하위에 전역/프로젝트 target에서 가져온 snapshot을 두는 방식이다. 메타데이터, 정식 원본, 백업 snapshot을 명확히 분리할 수 있기 때문이다.

### 11.2 스킬별 metadata

스킬 원본에 Sponzey metadata를 둘 수 있다.

```text
code-reviewer/
  SKILL.md
  .sponzey.json
```

예시:

```json
{
  "id": "skill_01",
  "source": "local",
  "createdAt": "2026-06-28T00:00:00+09:00",
  "lastAnalyzedAt": "2026-06-28T00:00:00+09:00",
  "riskLevel": "medium",
  "managedBy": "sponzey-skills-manager"
}
```

단, `SKILL.md` 표준과 충돌하지 않도록 Sponzey 전용 metadata는 별도 파일에 저장하는 것이 좋다.

### 11.3 적용 target metadata

복사 방식으로 적용할 경우 target 복사본에도 Sponzey metadata를 남길 수 있다.

```text
<target>/<skill-name>/
  SKILL.md
  .sponzey-applied.json
```

예시:

```json
{
  "managedBy": "sponzey-skills-manager",
  "sourceSkillId": "skill_01",
  "sourcePath": "~/SponzeySkills/skills/code-reviewer",
  "applyMode": "copy",
  "installedAt": "2026-06-28T00:00:00+09:00",
  "sourceHash": "..."
}
```

심링크 방식에서는 target의 심링크 자체가 연결 정보를 제공하지만, 별도 registry index에도 기록해야 한다.

### 11.4 백업 snapshot metadata

전역 또는 프로젝트 target에서 메인 리포지토리로 백업한 snapshot에는 백업 metadata를 남긴다.

```text
backups/
  2026-06-28T153000/
    global-codex-code-reviewer/
      SKILL.md
      .sponzey-backup.json
```

예시:

```json
{
  "managedBy": "sponzey-skills-manager",
  "backupType": "applied-skill-snapshot",
  "skillName": "code-reviewer",
  "sourceTargetPath": "~/.agents/skills/code-reviewer",
  "sourceScope": "global",
  "sourceClientType": "codex",
  "sourceApplyMode": "external",
  "createdAt": "2026-06-28T15:30:00+09:00",
  "sourceHash": "..."
}
```

백업 snapshot은 정식 원본 스킬과 구분한다. 사용자가 원할 경우 `Promote Backup to Skill` 명령으로 `skills/` 아래의 정식 스킬로 승격할 수 있다.

## 12. 스킬 분석 상세 설계

### 12.1 구조 분석

검사 항목:

- `SKILL.md` 존재 여부
- frontmatter parse 가능 여부
- `name` 필드 존재 여부
- `description` 필드 존재 여부
- 디렉터리명과 `name` 일치 여부
- references/scripts/assets 경로 존재 여부
- 잘못된 상대 경로 참조
- 너무 큰 파일
- binary asset 포함 여부

### 12.2 설명 품질 분석

`description`은 agent가 자동으로 스킬을 선택하는 데 중요한 신호다.

검사 항목:

- 너무 짧은 설명
- 너무 일반적인 설명
- 여러 목적이 섞인 설명
- 트리거 조건이 불명확한 설명
- 위험한 자동 호출을 유발할 수 있는 표현

좋은 description 예:

```text
Use this skill when reviewing pull requests for TypeScript backend services, especially to check API contract changes, test coverage, and database migration risks.
```

나쁜 description 예:

```text
Use this for coding.
```

### 12.3 보안 분석

검사 항목:

- destructive command 패턴
- credential 접근 패턴
- network upload 패턴
- package install 패턴
- shell script 자동 실행 지시
- MCP tool의 state-changing action 사용 가능성
- prompt injection 또는 policy override 문구
- 사용자 확인 없이 파일 삭제, 배포, 결제, 권한 변경 수행 지시

### 12.4 의존성 분석

검사 항목:

- `allowed-tools`
- `dependencies.tools`
- MCP server 참조
- shell command 참조
- Node/Python/Dart/Flutter/Cargo 등 runtime 요구
- 환경 변수 요구
- 외부 API key 요구
- 특정 OS 요구

### 12.5 호환성 분석

검사 항목:

- Agent Skills 표준 필드
- Codex 호환 필드
- Claude 호환 필드
- unknown field
- client별 지원되지 않는 기능
- 경로 규칙 차이

분석 결과 예:

```text
Compatibility
- Standard Agent Skills: valid
- Codex: valid with warnings
- Claude: uses Claude-only fields
```

## 13. 적용 모드 상세

### 13.1 Symlink Mode

동작:

- target 위치에 source skill directory를 가리키는 symbolic link를 만든다.
- source 변경이 즉시 target에 반영된다.

장점:

- 중복 파일이 없다.
- 원본 수정이 즉시 반영된다.
- 여러 프로젝트가 같은 스킬을 공유하기 쉽다.

주의:

- source path를 옮기면 링크가 깨진다.
- 일부 환경에서는 심링크 권한 문제가 생길 수 있다.
- 프로젝트를 다른 머신으로 복사하면 스킬이 포함되지 않는다.

필수 검사:

- 심링크 생성 가능 여부
- 기존 target 충돌
- broken link 감지
- link target이 메인 리포지토리 내부인지 확인

### 13.2 Copy Mode

동작:

- source skill directory를 target 위치에 실제 파일로 복사한다.
- source와 target은 이후 독립적으로 변경될 수 있다.

장점:

- 프로젝트와 함께 스킬을 보관하기 쉽다.
- source path 변경에 영향을 받지 않는다.
- 심링크를 지원하지 않는 환경에서도 동작한다.

주의:

- source 업데이트가 자동 반영되지 않는다.
- target 수정과 source 수정이 갈라질 수 있다.
- 복사본 삭제 시 사용자가 수정한 내용이 손실될 수 있다.

필수 검사:

- source hash와 target hash 비교
- target local modification 감지
- update copy 명령 제공
- source로 되돌리기 명령 제공

### 13.3 모드 전환

사용자는 적용된 스킬을 symlink에서 copy로, copy에서 symlink로 전환할 수 있어야 한다.

전환 정책:

| 전환                          | 처리                                   |
| --------------------------- | ------------------------------------ |
| Symlink -> Copy             | 링크를 제거하고 현재 source 내용을 복사            |
| Copy -> Symlink             | target 수정 여부 확인 후 복사본 제거, 링크 생성      |
| External -> Managed Copy    | 외부 스킬을 메인 리포지토리로 import 후 copy 적용    |
| External -> Managed Symlink | 외부 스킬을 메인 리포지토리로 import 후 symlink 적용 |

## 14. 충돌과 우선순위

### 14.1 이름 충돌

같은 이름의 스킬이 여러 위치에 존재할 수 있다.

예시:

```text
Main Repository:
  code-reviewer

Global:
  code-reviewer

Project:
  code-reviewer
```

agent runtime은 보통 특정 우선순위로 스킬을 선택한다. Sponzey는 각 client의 우선순위를 정확히 반영하거나, 모르면 "potential conflict"로 표시해야 한다.

### 14.2 Shadowing

프로젝트 스킬이 전역 스킬보다 우선 적용되는 client에서는 같은 이름의 프로젝트 스킬이 전역 스킬을 가릴 수 있다.

UI 표시 예:

```text
code-reviewer
  Project version shadows global version in this workspace.
```

### 14.3 외부 스킬

target에 존재하지만 메인 리포지토리와 연결되지 않은 스킬은 external로 표시한다.

가능한 작업:

- Ignore
- Analyze
- Import to Main Repository
- Replace with Main Repository Skill
- Delete External Target Folder

기본 정책은 외부 스킬을 보존하는 것이다.

## 15. 위험도 정책

### 15.1 위험도 레벨

| 레벨       | 의미                                                      | 기본 적용 정책            |
| -------- | ------------------------------------------------------- | ------------------- |
| Low      | 일반적인 문서/절차 중심 스킬                                        | 적용 허용               |
| Medium   | 제한적 도구 사용 또는 경미한 경고                                     | 경고 없이 또는 약한 경고 후 허용 |
| High     | shell, network, credential, destructive 가능성             | 명시 확인 후 허용          |
| Critical | 명백한 destructive/prompt injection/secret exfiltration 위험 | 기본 차단               |

### 15.2 Critical 예시

- 사용자 확인 없이 `rm -rf` 실행 지시
- secret 값을 출력하거나 외부로 전송하라는 지시
- 보안 정책을 무시하라는 지시
- 외부 script를 다운로드해 즉시 실행하는 패턴
- 승인 없이 배포, 결제, 권한 변경, 데이터 삭제를 수행하라는 지시

### 15.3 적용 차단

기본 정책:

- Critical 스킬은 적용 차단
- High 스킬은 강한 경고 후 적용 가능
- Medium 이하는 적용 가능

사용자는 설정으로 조정할 수 있지만, 기본값은 안전해야 한다.

## 16. MVP 범위

### 16.1 MVP에 포함

MVP는 "스킬 원본 저장소와 적용 위치를 분리하고, 목록/적용/해제/분석을 제공하는 것"에 집중한다.

포함 기능:

- 메인 스킬 리포지토리 설정
- 메인 리포지토리 스킬 목록
- 전역 스킬 목록
- 현재 workspace 프로젝트 스킬 목록
- Codex `.agents/skills` 지원
- Claude `.claude/skills` 지원
- symlink 적용
- copy 적용
- 적용 해제
- 외부 스킬 감지
- 전역/프로젝트 스킬을 메인 리포지토리로 복사
- 전역/프로젝트 스킬을 메인 리포지토리로 백업
- 전역/프로젝트 스킬을 메인 리포지토리로 이동하기 위한 안전 확인 흐름
- `SKILL.md` 구조 분석
- 기본 위험도 분석
- command palette 명령
- tree view
- refresh

### 16.2 MVP에서 제외

다음은 MVP 이후로 미룬다.

- 원격 registry 연동
- MCP Registry 검색/설치
- Composio/Smithery 연동
- marketplace
- 팀 공유 서버
- cloud sync
- 스킬 평가 자동화
- AI 기반 description rewrite
- webview 기반 고급 editor
- Git 기반 version management 자동화
- OpenAI API skill bundle upload

## 17. 이후 확장 방향

### 17.1 Registry 연동

MCP Registry, Smithery, Composio 같은 외부 카탈로그와 연결해 스킬이 요구하는 도구나 MCP server를 탐색할 수 있다.

### 17.2 Git 기반 스킬 리포지토리

메인 스킬 리포지토리를 Git 저장소로 초기화하고 다음 기능을 제공할 수 있다.

- 변경 이력 보기
- 스킬별 diff
- 스킬 업데이트 commit
- branch 기반 실험
- 팀 공유 repository clone

다만 Git은 extension의 필수 전제가 아니라 선택 기능이어야 한다.

### 17.3 고급 분석

정적 패턴 분석 이후 다음으로 확장할 수 있다.

- LLM 기반 위험도 리뷰
- script sandbox dry run
- MCP tool schema 검사
- secret scanning
- dependency vulnerability scan
- prompt injection classifier

### 17.4 팀 정책

팀 단위로 허용/차단 규칙을 정의할 수 있다.

예시:

```text
- Critical 스킬 적용 금지
- shell script 포함 스킬은 리뷰 필요
- 특정 MCP server만 허용
- 전역 적용 금지, 프로젝트 적용만 허용
```

## 18. 구현 아키텍처

### 18.1 Extension 구성 요소

권장 모듈:

```text
src/
  extension.ts
  config/
    settings.ts
  repository/
    mainRepository.ts
    repositoryScanner.ts
  targets/
    targetRegistry.ts
    codexTarget.ts
    claudeTarget.ts
  skills/
    skillParser.ts
    skillModel.ts
    skillApplier.ts
    skillRemover.ts
    skillImporter.ts
    skillBackup.ts
    skillTransfer.ts
  analysis/
    analyzer.ts
    rules/
      structureRules.ts
      securityRules.ts
      compatibilityRules.ts
      dependencyRules.ts
  views/
    mainRepositoryTree.ts
    globalSkillsTree.ts
    projectSkillsTree.ts
    diagnosticsTree.ts
  commands/
    registerCommands.ts
  storage/
    indexStore.ts
```

### 18.2 핵심 서비스

`MainRepositoryService`

- 메인 리포지토리 경로 관리
- 스킬 원본 목록 스캔
- 원본 생성/삭제/import
- 전역/프로젝트 target에서 복사된 스킬 저장
- 백업 snapshot 저장

`TargetService`

- 전역/project target 목록 관리
- client별 target path 계산
- target 유효성 검사

`SkillApplyService`

- symlink 적용
- copy 적용
- 충돌 검사
- 적용 해제
- 모드 전환

`SkillTransferService`

- target 스킬을 메인 리포지토리로 복사
- target 스킬을 메인 리포지토리로 이동
- target 스킬을 백업 snapshot으로 저장
- backup snapshot을 정식 skill source로 승격
- 복사/이동/백업 작업 감사 기록 생성

`SkillAnalysisService`

- `SKILL.md` parse
- 구조 검사
- 보안 검사
- 호환성 검사
- 진단 결과 생성

`IndexService`

- scan 결과 캐시
- 파일 변경 감지 후 invalidate
- tree view refresh 지원

### 18.3 파일 변경 감지

감지 대상:

- 메인 리포지토리
- 전역 target
- 현재 workspace target

감지 이벤트:

- 스킬 생성
- 스킬 삭제
- `SKILL.md` 수정
- 심링크 깨짐
- target 복사본 수정
- external target 스킬 추가
- target 스킬 백업 snapshot 생성

파일 변경 감지 후:

- 해당 스킬 상태 갱신
- 필요 시 분석 결과 stale 표시
- tree view refresh

## 19. 사용자 시나리오

### 19.1 새 스킬을 만들고 프로젝트에 적용

1. 사용자가 `Sponzey Skills: Create Skill` 실행
2. 이름과 설명 입력
3. 메인 리포지토리에 스킬 생성
4. 스킬 분석 실행
5. 사용자가 `Apply to Project` 선택
6. 대상 workspace와 client 선택
7. symlink 또는 copy 선택
8. 프로젝트 `.agents/skills` 또는 `.claude/skills`에 적용
9. Project Skills 목록에 표시

### 19.2 외부 스킬을 가져와 전역에 적용

1. 사용자가 `Import Skill` 실행
2. 외부 폴더 선택
3. 메인 리포지토리로 복사
4. 분석 실행
5. High risk 경고 표시
6. 사용자가 내용을 확인
7. `Apply Globally` 실행
8. 전역 target에 적용

### 19.3 프로젝트에서 스킬 제거

1. Project Skills 목록에서 스킬 선택
2. `Remove from Project` 실행
3. target이 symlink인지 copy인지 확인
4. target 항목 제거
5. 메인 리포지토리 원본은 유지

### 19.4 복사본 업데이트

1. 사용자가 메인 리포지토리의 원본 스킬 수정
2. Project Skills 목록에서 copy 적용 스킬이 `Source Changed`로 표시
3. 사용자가 `Update Copy from Source` 실행
4. target 수정 여부 검사
5. 충돌 없으면 복사본 업데이트

### 19.5 외부 스킬을 메인 리포지토리로 흡수

1. 전역 target에 Sponzey가 관리하지 않는 스킬 발견
2. Global Skills 목록에 `External` 표시
3. 사용자가 `Import to Main Repository` 선택
4. 원본 라이브러리에 복사
5. 기존 target은 managed copy 또는 symlink로 전환 가능

### 19.6 전역 스킬을 메인 리포지토리로 백업

1. 사용자가 Global Skills 목록에서 `~/.agents/skills/code-reviewer` 선택
2. `Backup to Main Repository` 실행
3. Sponzey가 target 스킬의 파일 목록과 hash 계산
4. 메인 리포지토리의 `backups/` 아래에 snapshot 생성
5. `.sponzey-backup.json`에 원본 target, client, scope, hash 기록
6. target 스킬은 변경하지 않음
7. 백업 목록 또는 Diagnostics에 snapshot 생성 결과 표시

### 19.7 프로젝트 스킬을 메인 리포지토리로 이동

1. Project Skills 목록에서 external 프로젝트 스킬 선택
2. `Move to Main Repository` 실행
3. 이름 충돌, target 수정 상태, 위험도 분석 결과 확인
4. 메인 리포지토리의 `skills/` 아래에 스킬 복사
5. 사용자가 target 제거 또는 managed symlink/copy 재적용 중 선택
6. 선택한 정책에 따라 프로젝트 target 정리
7. 이동 작업을 `SkillTransferOperation` 기록으로 저장

## 20. 성공 기준

MVP 성공 기준:

- 사용자가 메인 스킬 리포지토리를 설정할 수 있다.
- 메인 리포지토리의 스킬 목록을 볼 수 있다.
- 전역 스킬 목록을 볼 수 있다.
- 현재 프로젝트 스킬 목록을 볼 수 있다.
- 메인 리포지토리의 스킬을 전역에 적용할 수 있다.
- 명시적 Global enrollment가 현재와 이후 applyable Global target을 멱등 조정한다.
- 메인 리포지토리의 스킬을 프로젝트에 적용할 수 있다.
- symlink와 copy 방식을 모두 지원한다.
- 적용 해제 시 원본이 삭제되지 않는다.
- cleanup source delete는 exact managed placement만 제거·검증한 뒤 source를 삭제하고, 실패는 재시도 가능한 `deletion-pending`으로 남긴다.
- 전역 또는 프로젝트 target의 스킬을 메인 리포지토리로 복사할 수 있다.
- 전역 또는 프로젝트 target의 스킬을 메인 리포지토리에 백업 snapshot으로 저장할 수 있다.
- target 스킬을 메인 리포지토리로 이동할 때 원본 삭제/target 제거 여부를 명시적으로 확인한다.
- `SKILL.md`가 없는 잘못된 스킬을 감지한다.
- 위험 스킬을 High 또는 Critical로 표시할 수 있다.
- Critical 스킬은 기본적으로 적용을 차단한다.

## 21. 비목표

이 프로젝트는 다음을 1차 목표로 하지 않는다.

- agent runtime 자체 구현
- 스킬 실행 엔진 구현
- MCP server 실행 관리 전체 대체
- 원격 marketplace 운영
- 팀 계정/권한 서버 구축
- cloud 기반 스킬 동기화
- 모든 agent client의 완벽한 호환성 보장

Sponzey Skills Manager는 실행기가 아니라 관리 도구다. 스킬을 어디에 저장하고, 어디에 적용하고, 어떤 위험이 있는지 보여주는 것이 핵심이다.

## 22. 핵심 결론

Sponzey Skills Manager의 제품 정체성은 "Agent Skills의 로컬 원본 저장소와 적용 위치를 분리해 관리하는 VSCode Extension"이다.

가장 중요한 설계 결정은 메인 스킬 리포지토리를 전역 스킬 위치로 취급하지 않는 것이다. 모든 스킬은 기본적으로 메인 리포지토리에 저장되지만, 사용자가 전역 또는 프로젝트에 명시적으로 적용하기 전까지는 agent가 사용하는 스킬이 아니다.

이 분리는 다음 장점을 만든다.

- 원본 관리와 적용 상태가 명확해진다.
- 전역/프로젝트별 스킬 구성이 추적 가능해진다.
- 이미 적용된 전역/프로젝트 스킬을 메인 리포지토리로 회수하거나 백업할 수 있다.
- symlink와 copy 전략을 상황에 맞게 선택할 수 있다.
- 위험한 스킬을 적용 전에 분석할 수 있다.
- 삭제와 적용 해제를 안전하게 구분할 수 있다.

MVP는 이 구조를 안정적으로 구현하는 데 집중해야 한다. 이후 원격 registry, Git 기반 협업, AI 기반 분석, MCP 의존성 관리로 확장할 수 있다.
