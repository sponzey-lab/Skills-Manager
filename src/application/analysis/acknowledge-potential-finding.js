import { decidePotentialAcknowledgement } from "../../domain/index.js";

export async function acknowledgePotentialFinding({ context, input, triageStore }) {
  const sourceHash = input?.sourceHash;
  const finding = input?.finding;
  const acknowledgement = {
    sourceHash,
    ruleCode: finding?.policyRuleCode ?? finding?.code,
    evidenceFingerprint: finding?.evidenceFingerprint,
  };
  const decision = decidePotentialAcknowledgement({ finding, acknowledgement, sourceHash });
  if (!decision.allow) {
    return { ok: false, error: { code: decision.code, severity: decision.severity, message: "Potential finding acknowledgement is not valid." }, steps: ["ValidatingAcknowledgement", "Rejected"] };
  }
  if (typeof triageStore?.writeAcknowledgement !== "function") {
    return { ok: false, error: { code: "analysis-triage-store-unavailable", severity: "error", message: "Analysis acknowledgement storage is unavailable." }, steps: ["ValidatingAcknowledgement", "StoreUnavailable"] };
  }
  const writeResult = await triageStore.writeAcknowledgement({ repositoryPath: context?.mainRepositoryPath, acknowledgement });
  if (!writeResult.ok) return { ok: false, error: writeResult.error, steps: ["ValidatingAcknowledgement", "Persisting", "WriteFailed"] };
  return { ok: true, acknowledgement, diagnostics: [], events: [{ level: "ProductLog", code: "analysis.acknowledgement.completed", sourceHash }], steps: ["ValidatingAcknowledgement", "Persisting", "Completed"] };
}
