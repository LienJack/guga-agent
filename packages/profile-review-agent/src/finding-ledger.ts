export type ReviewSeverity = "P0" | "P1" | "P2" | "P3";

export type ReviewConfidence = "high" | "medium" | "low";

export type ReviewFindingCategory =
  | "correctness"
  | "security"
  | "performance"
  | "test-gap"
  | "maintainability"
  | "protocol"
  | "permission"
  | "context"
  | "session"
  | "profile";

export type ReviewFinding = {
  id: string;
  title: string;
  severity: ReviewSeverity;
  confidence: ReviewConfidence;
  category: ReviewFindingCategory;
  body: string;
  evidence: string[];
  file?: string;
  line?: number;
  recommendation?: string;
};

export type ReviewFindingLedger = {
  findings: ReviewFinding[];
};

const severityRank: Record<ReviewSeverity, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3
};

export function createReviewFindingLedger(findings: ReviewFinding[]): ReviewFindingLedger {
  return {
    findings: [...findings].sort(compareFindings)
  };
}

export function findingsBySeverity(ledger: ReviewFindingLedger): Record<ReviewSeverity, ReviewFinding[]> {
  return {
    P0: ledger.findings.filter((finding) => finding.severity === "P0"),
    P1: ledger.findings.filter((finding) => finding.severity === "P1"),
    P2: ledger.findings.filter((finding) => finding.severity === "P2"),
    P3: ledger.findings.filter((finding) => finding.severity === "P3")
  };
}

export function validateReviewFindingLedger(ledger: ReviewFindingLedger): string[] {
  const diagnostics: string[] = [];
  const ids = new Set<string>();
  for (const finding of ledger.findings) {
    if (ids.has(finding.id)) {
      diagnostics.push(`Duplicate finding id: ${finding.id}`);
    }
    ids.add(finding.id);
    if (finding.title.trim().length === 0) {
      diagnostics.push(`Finding ${finding.id} must include a title`);
    }
    if (finding.body.trim().length === 0) {
      diagnostics.push(`Finding ${finding.id} must include a body`);
    }
    if (finding.evidence.length === 0) {
      diagnostics.push(`Finding ${finding.id} must include evidence`);
    }
    if (finding.line !== undefined && (!Number.isInteger(finding.line) || finding.line < 1)) {
      diagnostics.push(`Finding ${finding.id} line must be a positive integer`);
    }
  }
  return diagnostics;
}

function compareFindings(left: ReviewFinding, right: ReviewFinding): number {
  const severity = severityRank[left.severity] - severityRank[right.severity];
  if (severity !== 0) {
    return severity;
  }
  const leftLocation = `${left.file ?? ""}:${left.line ?? 0}`;
  const rightLocation = `${right.file ?? ""}:${right.line ?? 0}`;
  return leftLocation.localeCompare(rightLocation) || left.id.localeCompare(right.id);
}
