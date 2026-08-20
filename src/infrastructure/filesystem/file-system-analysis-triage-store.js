import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const TRIAGE_PATH_PARTS = [".sponzey", "analysis-triage.json"];

export class FileSystemAnalysisTriageStore {
  async writeAcknowledgement({ repositoryPath, acknowledgement }) {
    const sanitized = sanitizeAcknowledgement(acknowledgement);
    if (!sanitized) return invalidAcknowledgement();

    try {
      const triagePath = path.join(repositoryPath, ...TRIAGE_PATH_PARTS);
      const current = await readDocument(triagePath);
      const acknowledgements = uniqueAcknowledgements([...current, sanitized]);
      await mkdir(path.dirname(triagePath), { recursive: true });
      const temporaryPath = `${triagePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify({ schemaVersion: 1, acknowledgements }, null, 2)}\n`);
      await rename(temporaryPath, triagePath);
      return { ok: true, triagePath };
    } catch {
      return { ok: false, error: { code: "analysis-triage-write-failed", severity: "error", message: "Analysis acknowledgement could not be saved." } };
    }
  }

  async readAcknowledgements({ repositoryPath }) {
    try {
      return { ok: true, acknowledgements: await readDocument(path.join(repositoryPath, ...TRIAGE_PATH_PARTS)) };
    } catch {
      return { ok: false, error: { code: "analysis-triage-read-failed", severity: "warning", message: "Analysis acknowledgements could not be read." } };
    }
  }
}

async function readDocument(triagePath) {
  try {
    const parsed = JSON.parse(await readFile(triagePath, "utf8"));
    return uniqueAcknowledgements(parsed?.acknowledgements ?? []);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function sanitizeAcknowledgement(value) {
  const sourceHash = String(value?.sourceHash ?? "").trim();
  const ruleCode = String(value?.ruleCode ?? "").trim();
  const evidenceFingerprint = String(value?.evidenceFingerprint ?? "").trim();
  return sourceHash && ruleCode && evidenceFingerprint
    ? { sourceHash, ruleCode, evidenceFingerprint }
    : null;
}

function uniqueAcknowledgements(values) {
  return [...new Map(values.map(sanitizeAcknowledgement).filter(Boolean).map((value) => [`${value.sourceHash}:${value.ruleCode}:${value.evidenceFingerprint}`, value])).values()];
}

function invalidAcknowledgement() {
  return { ok: false, error: { code: "analysis-triage-invalid-acknowledgement", severity: "error", message: "Acknowledgement identity is required." } };
}
