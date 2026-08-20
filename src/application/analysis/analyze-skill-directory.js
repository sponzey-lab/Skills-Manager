import {
  createBuiltInAnalyzerPolicyPack,
  decideAnalysisRisk,
  suggestRemediationActions,
} from "../../domain/index.js";

export function analyzeSkillDirectory({ directoryName, files, artifacts, coverage }) {
  const policyPack = createBuiltInAnalyzerPolicyPack();
  const steps = ["LoadingSkillDirectory"];
  const analysisFiles = filesFromArtifacts({ files, artifacts });
  const skillMd = analysisFiles["SKILL.md"];

  if (typeof skillMd !== "string") {
    const diagnostics = normalizePolicyDiagnostics({
      diagnostics: [
        {
          code: "missing-skill-md",
          category: "structure",
          severity: "critical",
          riskLevel: "critical",
          message: "Skill directory must contain SKILL.md.",
          recommendation: "Add a SKILL.md file at the root of the skill directory.",
        },
      ],
      policyPack,
    });

    return {
      manifest: {},
      body: "",
      dependencies: [],
      diagnostics,
      policyVersion: policyPack.version,
      policyRuleCodes: policyRuleCodesFromDiagnostics(diagnostics),
      riskLevel: "critical",
      steps: [...steps, "MissingSkillMd"],
    };
  }

  steps.push("ParsingSkillMd");
  const parsed = parseSkillMd(skillMd);
  const diagnostics = [...parsed.diagnostics];

  steps.push("RunningStructureRules");
  diagnostics.push(...runStructureRules({ directoryName, manifest: parsed.manifest }));

  steps.push("RunningDescriptionRules");
  diagnostics.push(...runDescriptionRules(parsed.manifest));
  diagnostics.push(...runReferenceRules({ body: parsed.body, files: analysisFiles }));

  steps.push("RunningSecurityRules");
  const potentialFindings = [];
  diagnostics.push(
    ...runSecurityRules({
      body: parsed.body,
      manifest: parsed.manifest,
      relativePath: "SKILL.md",
      artifactKind: "skill-manifest",
    }),
  );
  for (const artifact of analysisArtifacts(artifacts)) {
    if (artifact.relativePath === "SKILL.md") continue;
    const artifactSecurityDiagnostics = runSecurityRules({
      body: artifact.text,
      manifest: {},
      relativePath: artifact.relativePath,
      artifactKind: artifact.artifactKind,
    });
    diagnostics.push(...artifactSecurityDiagnostics);
    if (!artifactSecurityDiagnostics.some((diagnostic) => diagnostic.findingKind === "confirmed")) {
      potentialFindings.push(
        ...runPotentialSignals({
          body: artifact.text,
          relativePath: artifact.relativePath,
          artifactKind: artifact.artifactKind,
        }),
      );
    }
  }

  steps.push("RunningDependencyRules");
  const dependencies = extractDependencies({ body: parsed.body, manifest: parsed.manifest });
  diagnostics.push(...runDependencyRules({ dependencies, manifest: parsed.manifest }));

  steps.push("RunningCompatibilityRules");
  diagnostics.push(...runCompatibilityRules({ body: parsed.body, manifest: parsed.manifest }));

  steps.push("CalculatingRisk");
  const normalizedCoverage = normalizeCoverage(coverage);
  if (normalizedCoverage.skipped.length > 0) {
    diagnostics.push(coverageDiagnostic());
  }
  const riskDecision = decideAnalysisRisk({
    confirmedDiagnostics: diagnostics,
    potentialFindings,
  });
  diagnostics.push(...potentialFindings);
  if (riskDecision.reachability === "correlated") {
    diagnostics.push(potentialCorrelationDiagnostic(riskDecision));
  }
  const normalizedDiagnostics = normalizePolicyDiagnostics({ diagnostics, policyPack });

  return {
    manifest: parsed.manifest,
    body: "",
    dependencies,
    diagnostics: normalizedDiagnostics,
    policyVersion: policyPack.version,
    policyRuleCodes: policyRuleCodesFromDiagnostics(normalizedDiagnostics),
    riskLevel: riskDecision.riskLevel,
    riskDecision,
    ...(coverage ? { coverage: normalizedCoverage } : {}),
    steps: [
      ...steps,
      normalizedCoverage.skipped.length > 0 ? "CompletedWithCoverageGaps" : "Completed",
    ],
  };
}

function filesFromArtifacts({ files, artifacts }) {
  if (!Array.isArray(artifacts)) {
    return files ?? {};
  }

  return Object.fromEntries(
    artifacts
      .filter(
        (artifact) =>
          typeof artifact?.relativePath === "string" &&
          typeof artifact?.text === "string",
      )
      .map((artifact) => [artifact.relativePath, artifact.text]),
  );
}

function analysisArtifacts(artifacts) {
  return Array.isArray(artifacts)
    ? artifacts.filter(
        (artifact) =>
          typeof artifact?.relativePath === "string" &&
          typeof artifact?.text === "string",
      )
    : [];
}

function normalizeCoverage(coverage) {
  return {
    scannedFileCount: Number.isInteger(coverage?.scannedFileCount)
      ? coverage.scannedFileCount
      : 0,
    analyzedArtifactCount: Number.isInteger(coverage?.analyzedArtifactCount)
      ? coverage.analyzedArtifactCount
      : 0,
    skipped: Array.isArray(coverage?.skipped)
      ? coverage.skipped.map((item) => ({ ...item }))
      : [],
  };
}

function coverageDiagnostic() {
  return {
    code: "analysis-coverage-incomplete",
    category: "analysis",
    severity: "warning",
    riskLevel: "low",
    message: "Some skill artifacts were skipped during bounded analysis.",
    recommendation: "Review analysis coverage before treating the result as complete.",
  };
}

function parseSkillMd(content) {
  const lines = String(content ?? "").split(/\r?\n/);

  if (lines[0] !== "---") {
    return {
      manifest: {},
      body: String(content ?? ""),
      diagnostics: [],
    };
  }

  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) {
    return {
      manifest: {},
      body: String(content ?? ""),
      diagnostics: [
        {
          code: "malformed-frontmatter",
          category: "structure",
          severity: "high",
          riskLevel: "high",
          message: "Skill frontmatter must have a closing delimiter.",
          recommendation: "Close the frontmatter block with --- before the skill body.",
        },
      ],
    };
  }

  const frontmatter = parseFrontmatter(lines.slice(1, endIndex));
  return {
    manifest: frontmatter.manifest,
    body: lines.slice(endIndex + 1).join("\n"),
    diagnostics: frontmatter.diagnostics,
  };
}

function parseFrontmatter(lines) {
  const manifest = {};
  const diagnostics = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      diagnostics.push({
        code: "malformed-frontmatter-line",
        category: "structure",
        severity: "warning",
        riskLevel: "low",
        message: "Skill frontmatter line must use key: value format.",
        recommendation: "Rewrite invalid frontmatter lines as key: value pairs.",
      });
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key.length > 0) {
      manifest[key] = value;
    }
  }

  return {
    manifest: Object.freeze(manifest),
    diagnostics,
  };
}

function runStructureRules({ directoryName, manifest }) {
  const diagnostics = [];
  const name = String(manifest.name ?? "").trim();

  if (name.length === 0) {
    diagnostics.push({
      code: "missing-name",
      category: "structure",
      severity: "high",
      riskLevel: "high",
      message: "Skill frontmatter must include name.",
      recommendation: "Add a name field matching the skill directory name.",
    });
    return diagnostics;
  }

  if (String(directoryName ?? "").trim() !== name) {
    diagnostics.push({
      code: "skill-name-directory-mismatch",
      category: "structure",
      severity: "warning",
      riskLevel: "low",
      message: "Skill name must match the directory name.",
      recommendation: "Rename the directory or update frontmatter name so they match.",
    });
  }

  return diagnostics;
}

function runDescriptionRules(manifest) {
  const description = String(manifest.description ?? "").trim();

  if (description.length === 0) {
    return [
      {
        code: "missing-description",
        category: "quality",
        severity: "high",
        riskLevel: "high",
        message: "Skill frontmatter must include description.",
        recommendation: "Add a specific activation condition in the description field.",
      },
    ];
  }

  if (description.length < 16 || /^use this for coding\.?$/i.test(description)) {
    return [
      {
        code: "broad-description",
        category: "quality",
        severity: "warning",
        riskLevel: "low",
        message: "Skill description must identify a specific activation condition.",
        recommendation: "Describe the exact situation where this skill should be used.",
      },
    ];
  }

  return [];
}

function runReferenceRules({ body, files }) {
  const diagnostics = [];
  const referencePaths = new Set();
  const referencePattern = /\breferences\/[A-Za-z0-9._/-]+/g;

  for (const match of String(body ?? "").matchAll(referencePattern)) {
    referencePaths.add(trimReferencePath(match[0]));
  }

  for (const referencePath of referencePaths) {
    if (typeof files?.[referencePath] !== "string") {
      diagnostics.push({
        code: "missing-referenced-file",
        category: "structure",
        severity: "warning",
        riskLevel: "low",
        message: "Referenced file is missing.",
        recommendation: "Add the referenced file or remove the stale reference.",
        referencePath,
      });
    }
  }

  return diagnostics;
}

function runSecurityRules({ body, manifest, relativePath, artifactKind }) {
  const text = securityText({ body, artifactKind });
  const diagnostics = [];

  if (/\brm\s+-rf\b/i.test(text)) {
    diagnostics.push(confirmedSecurityDiagnostic({
      code: "destructive-rm-rf",
      severity: "critical",
      message: "Destructive remove command detected.",
      recommendation: "Remove destructive shell instructions or require an explicit guarded workflow.",
      relativePath,
      line: lineForPattern(text, /\brm\s+-rf\b/i),
    }));
  }

  if (/\bcurl\b[^\n|]*\|\s*(?:sh|bash)\b/i.test(text)) {
    diagnostics.push(confirmedSecurityDiagnostic({
      code: "curl-pipe-shell",
      severity: "critical",
      message: "Curl to shell pattern detected.",
      recommendation: "Replace curl-to-shell execution with explicit download, verification, and review steps.",
      relativePath,
      line: lineForPattern(text, /\bcurl\b[^\n|]*\|\s*(?:sh|bash)\b/i),
    }));
  }

  const downloadedScript = /\b(?:curl|wget)\b[^\n]*\s-o\s+([^\s]+)/i.exec(text);
  if (
    downloadedScript &&
    new RegExp(`\\b(?:sh|bash)\\s+${escapeRegExp(downloadedScript[1])}\\b`, "i").test(text)
  ) {
    diagnostics.push(confirmedSecurityDiagnostic({
      code: "download-then-execute",
      severity: "critical",
      message: "Downloaded script is executed without a verification step.",
      recommendation: "Require a verified checksum and explicit review before executing downloaded content.",
      relativePath,
      line: lineForPattern(text, /\b(?:curl|wget)\b[^\n]*\s-o\s+([^\s]+)/i),
    }));
  }

  if (/\b(?:api[_-]?key|token|secret)\b[^\n]*(?:curl|fetch|http)/i.test(text)) {
    diagnostics.push(confirmedSecurityDiagnostic({
      code: "secret-exfiltration-pattern",
      severity: "critical",
      message: "Potential secret exfiltration pattern detected.",
      recommendation: "Remove instructions that send credentials or secret-like values over the network.",
      relativePath,
      line: lineForPattern(text, /\b(?:api[_-]?key|token|secret)\b[^\n]*(?:curl|fetch|http)/i),
    }));
  }

  if (/ignore (?:previous|all) instructions|override (?:policy|safety)|disable (?:guard|policy)/i.test(text)) {
    diagnostics.push(confirmedSecurityDiagnostic({
      code: "policy-override-pattern",
      severity: "critical",
      message: "Policy override instruction pattern detected.",
      recommendation: "Remove policy override language from the skill instructions.",
      relativePath,
      line: lineForPattern(text, /ignore (?:previous|all) instructions|override (?:policy|safety)|disable (?:guard|policy)/i),
    }));
  }

  if (/\b(?:chmod\s+-R\s+(?:777|a\+rwx)|chown\s+-R\s+(?:root|\d+))\b/i.test(text)) {
    diagnostics.push(confirmedSecurityDiagnostic({
      code: "unsafe-permission-change",
      severity: "critical",
      message: "Unsafe recursive permission or ownership change detected.",
      recommendation: "Remove recursive world-writable permission changes and use the minimum explicit permission.",
      relativePath,
      line: lineForPattern(text, /\b(?:chmod\s+-R\s+(?:777|a\+rwx)|chown\s+-R\s+(?:root|\d+))\b/i),
    }));
  }

  const allowedTools = String(manifest["allowed-tools"] ?? manifest.allowedTools ?? "");
  if (/\*|bash|shell|terminal/i.test(allowedTools)) {
    diagnostics.push({
      code: "broad-allowed-tools",
      category: "dependency",
      severity: "medium",
      riskLevel: "medium",
      message: "Allowed tools declaration is broad.",
      recommendation: "Limit allowed tools to the smallest explicit set required by the skill.",
    });
  }

  return diagnostics;
}

function securityText({ body, artifactKind }) {
  const text = String(body ?? "");
  if (artifactKind === "script") return text;
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .map((line) => line.replace(/`[^`]*`/g, ""))
    .join("\n");
}

function runPotentialSignals({ body, relativePath, artifactKind }) {
  if (artifactKind !== "script") return [];
  const text = securityText({ body, artifactKind });
  const signals = [
    potentialSignal({
      code: "potential-credential-access",
      signalFamily: "credential",
      pattern: /\b(?:api[_-]?key|api[_-]?token|access[_-]?token|api[_-]?secret)\b/i,
      summary: "Potential credential access signal detected.",
      relativePath,
      text,
    }),
    potentialSignal({
      code: "potential-network-transfer",
      signalFamily: "network",
      pattern: /\b(?:curl|wget|fetch)\b[^\n]*(?:https?:\/\/|\$\{|\bURL\b)/i,
      summary: "Potential network transfer signal detected.",
      relativePath,
      text,
    }),
    potentialSignal({
      code: "potential-download",
      signalFamily: "download",
      pattern: /\b(?:curl|wget)\b[^\n]*(?:https?:\/\/)/i,
      summary: "Potential remote download signal detected.",
      relativePath,
      text,
    }),
    potentialSignal({
      code: "potential-execution",
      signalFamily: "execution",
      pattern: /\b(?:sh|bash|zsh|node|python(?:3)?)\s+(?:\$\{|\/|\.\/)/i,
      summary: "Potential local execution signal detected.",
      relativePath,
      text,
    }),
    potentialSignal({
      code: "potential-broad-file-access",
      signalFamily: "broad-file-access",
      pattern: /(?:\$HOME|~\/|\/\*|%USERPROFILE%)/i,
      summary: "Potential broad file access signal detected.",
      relativePath,
      text,
    }),
    potentialSignal({
      code: "potential-destructive-intent",
      signalFamily: "destructive-intent",
      pattern: /\b(?:delete|remove|wipe)\b/i,
      summary: "Potential destructive intent signal detected.",
      relativePath,
      text,
    }),
  ];

  return signals.filter(Boolean);
}

function potentialSignal({
  code,
  signalFamily,
  pattern,
  summary,
  relativePath,
  text,
}) {
  const line = lineForPattern(text, pattern);
  if (!pattern.test(text)) return null;

  return {
    code,
    category: "security",
    severity: "warning",
    riskLevel: "medium",
    findingKind: "potential",
    confidence: "low",
    impact: "high",
    reachability: "unconfirmed",
    signalFamily,
    message: summary,
    recommendation: "Review this signal with related behavior before applying the skill.",
    evidence: {
      relativePath,
      line,
      summary: "Matched a non-blocking potential-risk signal.",
    },
    evidenceFingerprint: `${code}:${relativePath}:${line}`,
    provenance: "builtin-policy-v1",
  };
}

function potentialCorrelationDiagnostic(riskDecision) {
  return {
    code: "potential-risk-correlation",
    category: "security",
    severity: "high",
    riskLevel: "high",
    findingKind: "potential",
    confidence: riskDecision.confidence,
    impact: riskDecision.impact,
    reachability: riskDecision.reachability,
    signalFamilies: riskDecision.correlatedSignalFamilies,
    message: "Independent potential-risk signals correlate and require confirmation.",
    recommendation: "Review the correlated behavior and explicitly confirm before applying.",
    provenance: "builtin-policy-v1",
  };
}

function confirmedSecurityDiagnostic({
  code,
  severity,
  message,
  recommendation,
  relativePath,
  line,
}) {
  return {
    code,
    category: "security",
    severity,
    riskLevel: severity,
    message,
    recommendation,
    ...(relativePath
      ? {
          findingKind: "confirmed",
          confidence: "high",
          impact: severity,
          evidence: {
            relativePath,
            line,
            summary: "Matched a verified security rule.",
          },
          provenance: "builtin-policy-v1",
        }
      : {}),
  };
}

function lineForPattern(text, pattern) {
  const match = pattern.exec(text);
  return match ? text.slice(0, match.index).split("\n").length : 1;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractDependencies({ body, manifest }) {
  const text = `${Object.values(manifest ?? {}).join("\n")}\n${String(body ?? "")}`;
  const dependencies = [];

  for (const match of text.matchAll(/\bmcp(?:Server|[_ -]?server)?[:= ]+([A-Za-z0-9._/-]+)/gi)) {
    dependencies.push(dependency("mcp", match[1], "mcp"));
  }

  for (const match of text.matchAll(/\b(?:curl|wget|fetch)\s+(https?:\/\/[^\s)]+)/gi)) {
    dependencies.push(dependency("network", redactUrl(match[1]), "network"));
  }

  for (const match of text.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)) {
    if (/(TOKEN|SECRET|KEY|HOST|URL|PATH)$/.test(match[0])) {
      dependencies.push(dependency("environment", match[0], "environment"));
    }
  }

  for (const match of text.matchAll(/\b(?:requires?|needs?)\s+(node(?:\.js)?|python|deno|bun|ruby|go)\b/gi)) {
    dependencies.push(dependency("runtime", runtimeName(match[1]), "runtime"));
  }

  for (const match of text.matchAll(/\b(npm|pnpm|yarn|pip|uv|cargo|go)\s+[A-Za-z0-9:_./-]+/gi)) {
    dependencies.push(dependency("tool", match[1].toLowerCase(), "tool"));
  }

  return uniqueDependencies(dependencies);
}

function runDependencyRules({ dependencies }) {
  const dependencyCategories = uniqueStrings(
    dependencies.map((item) => item.category ?? item.type),
  );

  return dependencies.length > 0
    ? [
        {
          code: "external-dependencies-detected",
          category: "dependency",
          severity: "warning",
          riskLevel: "low",
          message: "Skill declares external dependencies.",
          recommendation: "Review external dependencies before applying this skill.",
          dependencyCount: dependencies.length,
          dependencyCategories,
        },
      ]
    : [];
}

function runCompatibilityRules({ body, manifest }) {
  const text = `${Object.values(manifest ?? {}).join("\n")}\n${String(body ?? "")}`;
  const diagnostics = [];

  if (/claude\s+only|requires\s+claude/i.test(text)) {
    diagnostics.push({
      code: "claude-only-compatibility",
      category: "compatibility",
      severity: "warning",
      riskLevel: "low",
      message: "Skill appears to require Claude-specific behavior.",
      recommendation: "Review compatibility before applying this skill to Codex targets.",
    });
  }

  if (/codex\s+only|requires\s+codex/i.test(text)) {
    diagnostics.push({
      code: "codex-only-compatibility",
      category: "compatibility",
      severity: "warning",
      riskLevel: "low",
      message: "Skill appears to require Codex-specific behavior.",
      recommendation: "Review compatibility before applying this skill to non-Codex targets.",
    });
  }

  return diagnostics;
}

function normalizePolicyDiagnostics({ diagnostics, policyPack }) {
  const ruleByCode = new Map(
    policyPack.rules.map((rule) => [rule.code, rule]),
  );

  return diagnostics.map((diagnostic) => {
    const rule = ruleByCode.get(diagnostic.code);
    const remediationActions = suggestRemediationActions({ diagnostic });
    if (!rule) {
      return {
        ...diagnostic,
        ...remediationActions,
      };
    }

    return {
      ...diagnostic,
      policyRuleCode: rule.code,
      policyVersion: policyPack.version,
      ...remediationActions,
    };
  });
}

function policyRuleCodesFromDiagnostics(diagnostics) {
  return uniqueStrings(
    diagnostics
      .map((diagnostic) => diagnostic.policyRuleCode)
      .filter((code) => typeof code === "string" && code.length > 0),
  );
}

function trimReferencePath(referencePath) {
  return referencePath.replace(/[),.;:!?]+$/g, "");
}

function dependency(type, name, category) {
  return Object.freeze({ type, name, category });
}

function uniqueDependencies(dependencies) {
  const seen = new Set();
  const unique = [];

  for (const item of dependencies) {
    const key = `${item.type}:${item.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

function redactUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "network-url";
  }
}

function runtimeName(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.startsWith("node")) return "node";
  if (normalized.startsWith("python")) return "python";
  if (normalized.startsWith("deno")) return "deno";
  if (normalized.startsWith("bun")) return "bun";
  if (normalized.startsWith("ruby")) return "ruby";
  if (normalized.startsWith("go")) return "go";
  return normalized.split(/\s+/)[0];
}

function uniqueStrings(values) {
  const seen = new Set();
  const unique = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }

  return unique;
}
