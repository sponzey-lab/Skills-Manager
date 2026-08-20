import test from "node:test";
import assert from "node:assert/strict";
import { transitionAnalysisBatch } from "../../src/application/index.js";

test("analysis batch state machine reaches completed partial and cancelled terminals", () => {
  assert.equal(transitionAnalysisBatch("Idle", "Start").state, "Enumerating");
  assert.equal(transitionAnalysisBatch("Enumerating", "SourcesFound").state, "Analyzing");
  assert.equal(transitionAnalysisBatch("Analyzing", "SourceCompleted").state, "Analyzing");
  assert.equal(transitionAnalysisBatch("Analyzing", "SourceFailed").state, "AnalyzingPartial");
  assert.equal(transitionAnalysisBatch("AnalyzingPartial", "SourceCompleted").state, "AnalyzingPartial");
  assert.equal(transitionAnalysisBatch("AnalyzingPartial", "Finish").state, "CompletedWithFailures");
  assert.equal(transitionAnalysisBatch("Analyzing", "Cancelled").state, "Cancelled");
});
