import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const checklistPath = "docs/release-smoke.md";
const evidenceTemplatePath = "docs/extension-host-smoke-evidence.md";

const requiredSections = Object.freeze([
  "## 1. 자동 검증",
  "## 2. 확장 개발 호스트",
  "## 3. 리포지토리 설정",
  "## 4. 리포지토리 인덱스와 버전 관리",
  "## 5. Main Repository 스킬 생명주기",
  "## 6. Global 및 Project 적용",
  "## 7. Diagnostics와 Analysis",
  "## 8. 백업 전송과 안전성",
  "## 9. Diagnostics Remediation Workflow",
  "## 10. Watcher Refresh와 Runtime Recomposition",
  "## 11. 문서와 Release Gate",
]);

const requiredPhase004Signals = Object.freeze([
  "scripts/run-vscode-extension-host.sh",
  "workspace folder가 열려 있으면 Project Skills view가 표시",
  "파일만 연 VSCode window에서는 Project Skills view가 숨겨",
  "기본 Main Repository",
  "Repository Index V2",
  "sourceId",
  "Local Git versioning",
  "Git URL 또는 local path install",
  "Codex/OpenAI",
  "공통 custom generic image",
  "Target Profile",
  "Analyze All Skills",
  "Diagnostics view",
  "Built-In Analyzer Policy Pack",
  "policy code",
  "recommendation",
  "Backup Compare",
  "Restore Backup",
  "remediation action",
  "Open SKILL.md",
  "현재 VSCode window",
  "source delete와 applied remove",
  "watcher refresh",
  "stale analysis",
  "displayName",
  "categories",
  "keywords",
  "extensionKind",
  "check:vsix-candidate",
  "package:vsix-candidate",
  "PackagingToolMissing",
  "Release VSIX",
  "GitHub Release",
  "tag",
  "`v` prefix",
  "build-only",
  "v0.1.1a",
  "VSIX publishing이 필요하지 않다",
]);

const requiredEvidenceSections = Object.freeze([
  "# Phase 004 확장 호스트 수동 검증 기록",
  "## 1. 검증 세션",
  "## 2. 환경",
  "## 3. 실행 명령",
  "## 4. 체크리스트 결과 요약",
  "## 5. 실패 또는 차단 항목",
  "## 6. 검증 증거 메모",
  "## 7. 릴리스 판단",
]);

test("Phase 004 release smoke checklist exists with required sections", async () => {
  const content = await readFile(checklistPath, "utf8");

  for (const section of requiredSections) {
    assert.match(content, new RegExp(escapeRegExp(section)));
  }
});

test("Phase 004 release smoke checklist covers required product signals", async () => {
  const content = await readFile(checklistPath, "utf8");

  for (const signal of requiredPhase004Signals) {
    assert.match(content, new RegExp(escapeRegExp(signal), "i"));
  }
});

test("Phase 004 extension host smoke evidence template exists with required sections", async () => {
  const content = await readFile(evidenceTemplatePath, "utf8");

  for (const section of requiredEvidenceSections) {
    assert.match(content, new RegExp(escapeRegExp(section)));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
