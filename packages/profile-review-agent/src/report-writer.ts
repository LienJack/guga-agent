import type { ReviewFindingLedger } from "./finding-ledger";
import { findingsBySeverity, validateReviewFindingLedger } from "./finding-ledger";

export type ReviewReportInput = {
  title: string;
  ledger: ReviewFindingLedger;
  openQuestions?: string[];
  summary?: string;
};

export type ReviewReportQualityDiagnostic = {
  severity: "error" | "warning";
  message: string;
};

export function renderReviewReport(input: ReviewReportInput): string {
  const groups = findingsBySeverity(input.ledger);
  const lines = [`# ${input.title}`, "", "## Findings"];

  let findingCount = 0;
  for (const severity of ["P0", "P1", "P2", "P3"] as const) {
    const findings = groups[severity];
    if (findings.length === 0) {
      continue;
    }
    lines.push("", `### ${severity}`);
    for (const finding of findings) {
      findingCount += 1;
      const location = finding.file === undefined ? "" : ` (${finding.file}${finding.line === undefined ? "" : `:${finding.line}`})`;
      lines.push("", `- **${finding.title}**${location}`);
      lines.push(`  - Category: ${finding.category}`);
      lines.push(`  - Confidence: ${finding.confidence}`);
      lines.push(`  - Detail: ${finding.body}`);
      lines.push(`  - Evidence: ${finding.evidence.join("; ")}`);
      if (finding.recommendation !== undefined) {
        lines.push(`  - Recommendation: ${finding.recommendation}`);
      }
    }
  }

  if (findingCount === 0) {
    lines.push("", "No findings.");
  }

  lines.push("", "## Open Questions");
  if ((input.openQuestions ?? []).length === 0) {
    lines.push("", "None.");
  } else {
    for (const question of input.openQuestions ?? []) {
      lines.push(`- ${question}`);
    }
  }

  lines.push("", "## Summary", "", input.summary ?? "No additional summary.");
  return lines.join("\n");
}

export function checkReviewReportInput(input: ReviewReportInput): ReviewReportQualityDiagnostic[] {
  const diagnostics: ReviewReportQualityDiagnostic[] = validateReviewFindingLedger(input.ledger).map((message) => ({
    severity: "error",
    message
  }));
  if (input.ledger.findings.length === 0) {
    diagnostics.push({
      severity: "warning",
      message: "Review report has no findings; confirm this is intentional"
    });
  }
  if (input.title.trim().length === 0) {
    diagnostics.push({
      severity: "error",
      message: "Review report title is required"
    });
  }
  return diagnostics;
}
