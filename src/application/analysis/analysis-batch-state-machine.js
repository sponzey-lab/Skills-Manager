const transitions = Object.freeze({
  Idle: Object.freeze({ Start: "Enumerating" }),
  Enumerating: Object.freeze({ SourcesFound: "Analyzing", EnumerationFailed: "Failed", Cancelled: "Cancelled" }),
  Analyzing: Object.freeze({ SourceCompleted: "Analyzing", SourceFailed: "AnalyzingPartial", Finish: "Completed", Cancelled: "Cancelled" }),
  AnalyzingPartial: Object.freeze({ SourceCompleted: "AnalyzingPartial", SourceFailed: "AnalyzingPartial", Finish: "CompletedWithFailures", Cancelled: "Cancelled" }),
});

export function transitionAnalysisBatch(state, event) {
  const nextState = transitions[state]?.[event];
  return nextState
    ? { ok: true, state: nextState }
    : { ok: false, state, diagnostic: { code: "invalid-analysis-batch-transition", severity: "error", message: `Analysis batch cannot handle ${event} while in ${state}.` } };
}
