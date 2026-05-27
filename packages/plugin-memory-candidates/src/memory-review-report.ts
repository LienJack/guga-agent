import {
  scanMemoryCandidateContent,
  validateMemoryCandidate,
  type MemoryCandidate,
  type MemoryCandidateKind,
  type MemoryCandidateScope,
  type MemorySafetyStatus
} from "./memory-candidates";
import {
  validateMemoryDecision,
  type GovernedMemoryItem,
  type MemoryGovernanceDiagnostic,
  type MemoryGovernanceLedger
} from "./memory-governance";

export type MemoryReviewReportCounts = {
  candidates: number;
  decisions: number;
  active: number;
  superseded: number;
  rejected: number;
  undecided: number;
  unsafe: number;
  diagnostics: number;
};

export type MemoryReviewCandidateSummary = {
  id: string;
  scope: MemoryCandidateScope;
  kind: MemoryCandidateKind;
  status: MemoryCandidate["status"];
  safetyStatus: MemorySafetyStatus;
  safetyReasons: string[];
  createdAt: string;
  content: string;
  tags?: string[];
};

export type MemoryReviewReport = {
  counts: MemoryReviewReportCounts;
  activeItems: GovernedMemoryItem[];
  supersededItems: GovernedMemoryItem[];
  rejectedCandidateIds: string[];
  undecidedCandidates: MemoryReviewCandidateSummary[];
  unsafeCandidates: MemoryReviewCandidateSummary[];
  diagnostics: MemoryGovernanceDiagnostic[];
};

export type MemoryReviewHealthStatus = "healthy" | "needs_review" | "blocked";

export type MemoryReviewHealth = {
  status: MemoryReviewHealthStatus;
  reasons: string[];
  counts: Pick<MemoryReviewReportCounts, "active" | "undecided" | "unsafe" | "diagnostics">;
};

export type RenderMemoryReviewReportOptions = {
  title?: string;
  maxActiveItems?: number;
  maxSupersededItems?: number;
  maxCandidateItems?: number;
  maxDiagnostics?: number;
  maxContentChars?: number;
};

export function createMemoryReviewHealth(report: MemoryReviewReport): MemoryReviewHealth {
  const reasons: string[] = [];
  if (report.counts.diagnostics > 0) {
    reasons.push("governance-diagnostics");
  }
  if (report.counts.unsafe > 0) {
    reasons.push("unsafe-candidates");
  }
  if (report.counts.undecided > 0) {
    reasons.push("undecided-candidates");
  }

  const status: MemoryReviewHealthStatus =
    report.counts.diagnostics > 0 || report.counts.unsafe > 0
      ? "blocked"
      : report.counts.undecided > 0
        ? "needs_review"
        : "healthy";

  return {
    status,
    reasons,
    counts: {
      active: report.counts.active,
      undecided: report.counts.undecided,
      unsafe: report.counts.unsafe,
      diagnostics: report.counts.diagnostics
    }
  };
}

export function renderMemoryReviewHealthBlock(health: MemoryReviewHealth, title = "Memory Review Health"): string {
  const reasons = health.reasons.length > 0 ? health.reasons.join(", ") : "none";
  return [
    `## ${title}`,
    "",
    `- status: ${health.status}`,
    `- active: ${health.counts.active}`,
    `- undecided: ${health.counts.undecided}`,
    `- unsafe: ${health.counts.unsafe}`,
    `- diagnostics: ${health.counts.diagnostics}`,
    `- reasons: ${reasons}`
  ].join("\n");
}

export function createMemoryReviewReport(ledger: MemoryGovernanceLedger): MemoryReviewReport {
  const decisionedCandidateIds = new Set(
    ledger.decisions
      .filter((decision) => validateMemoryDecision(decision).length === 0)
      .map((decision) => decision.candidateId)
  );
  const rejectedCandidateIds = Array.from(new Set(
    ledger.decisions
      .filter((decision) => decision.action === "reject" && validateMemoryDecision(decision).length === 0)
      .map((decision) => decision.candidateId)
  )).sort();
  const undecidedCandidates = ledger.candidates
    .filter((candidate) => !decisionedCandidateIds.has(candidate.id))
    .map(summarizeCandidate)
    .sort(compareCandidateSummaries);
  const unsafeCandidates = ledger.candidates
    .filter((candidate) => candidate.safety.status !== "safe" || scanMemoryCandidateContent(candidate.content).status !== "safe")
    .map(summarizeCandidate)
    .sort(compareCandidateSummaries);
  const activeItems = ledger.items.filter((item) => item.status === "active").sort(compareItems);
  const supersededItems = ledger.items.filter((item) => item.status === "superseded").sort(compareItems);

  return {
    counts: {
      candidates: ledger.candidates.length,
      decisions: ledger.decisions.length,
      active: activeItems.length,
      superseded: supersededItems.length,
      rejected: ledger.counts.rejected,
      undecided: undecidedCandidates.length,
      unsafe: unsafeCandidates.length,
      diagnostics: ledger.diagnostics.length
    },
    activeItems,
    supersededItems,
    rejectedCandidateIds,
    undecidedCandidates,
    unsafeCandidates,
    diagnostics: [...ledger.diagnostics].sort(compareDiagnostics)
  };
}

export function renderMemoryReviewReport(
  report: MemoryReviewReport,
  options: RenderMemoryReviewReportOptions = {}
): string {
  const title = options.title ?? "Memory Review Report";
  const maxActiveItems = options.maxActiveItems ?? 6;
  const maxSupersededItems = options.maxSupersededItems ?? 4;
  const maxCandidateItems = options.maxCandidateItems ?? 6;
  const maxDiagnostics = options.maxDiagnostics ?? 6;
  const maxContentChars = options.maxContentChars ?? 140;
  const lines = [
    `# ${title}`,
    "",
    "## Summary",
    "",
    `- candidates: ${report.counts.candidates}`,
    `- decisions: ${report.counts.decisions}`,
    `- active: ${report.counts.active}`,
    `- superseded: ${report.counts.superseded}`,
    `- rejected: ${report.counts.rejected}`,
    `- undecided: ${report.counts.undecided}`,
    `- unsafe: ${report.counts.unsafe}`,
    `- diagnostics: ${report.counts.diagnostics}`,
    "",
    "## Active Items",
    "",
    ...renderItems(report.activeItems, maxActiveItems, maxContentChars),
    "",
    "## Needs Review",
    "",
    ...renderCandidates(report.undecidedCandidates, "No undecided candidates.", maxCandidateItems, maxContentChars),
    "",
    "## Unsafe Candidates",
    "",
    ...renderCandidates(report.unsafeCandidates, "No unsafe candidates.", maxCandidateItems, maxContentChars),
    "",
    "## Rejected Candidates",
    "",
    ...renderRejected(report.rejectedCandidateIds, maxCandidateItems),
    "",
    "## Superseded Items",
    "",
    ...renderItems(report.supersededItems, maxSupersededItems, maxContentChars),
    "",
    "## Diagnostics",
    "",
    ...renderDiagnostics(report.diagnostics, maxDiagnostics)
  ];
  return lines.join("\n");
}

function summarizeCandidate(candidate: MemoryCandidate): MemoryReviewCandidateSummary {
  const scanned = scanMemoryCandidateContent(candidate.content);
  const validationReasons = validateMemoryCandidate(candidate).map((diagnostic) => diagnostic.code);
  const safetyReasons = Array.from(new Set([
    ...candidate.safety.reasons,
    ...scanned.reasons,
    ...validationReasons
  ])).sort();
  return {
    id: candidate.id,
    scope: candidate.scope,
    kind: candidate.kind,
    status: candidate.status,
    safetyStatus: moreRestrictiveSafety(candidate.safety.status, scanned.status),
    safetyReasons,
    createdAt: candidate.createdAt,
    content: candidate.content,
    ...(candidate.tags ? { tags: [...candidate.tags].sort() } : {})
  };
}

function renderItems(items: readonly GovernedMemoryItem[], maxItems: number, maxContentChars: number): string[] {
  const renderable = items.slice(0, maxItems);
  if (renderable.length === 0) {
    return ["No memory items."];
  }
  return renderable.map((item) =>
    `- ${item.id} (${item.scope}/${item.kind}, ${item.status}, importance ${item.importance.toFixed(2)}): ${truncate(item.content, maxContentChars)}`
  );
}

function renderCandidates(
  candidates: readonly MemoryReviewCandidateSummary[],
  emptyText: string,
  maxItems: number,
  maxContentChars: number
): string[] {
  const renderable = candidates.slice(0, maxItems);
  if (renderable.length === 0) {
    return [emptyText];
  }
  return renderable.map((candidate) => {
    const reasons = candidate.safetyReasons.length > 0 ? ` reasons:${candidate.safetyReasons.join(",")}` : "";
    return `- ${candidate.id} (${candidate.scope}/${candidate.kind}, ${candidate.status}, ${candidate.safetyStatus}${reasons}): ${truncate(candidate.content, maxContentChars)}`;
  });
}

function renderRejected(candidateIds: readonly string[], maxItems: number): string[] {
  const renderable = candidateIds.slice(0, maxItems);
  if (renderable.length === 0) {
    return ["No rejected candidates."];
  }
  return renderable.map((candidateId) => `- ${candidateId}`);
}

function renderDiagnostics(diagnostics: readonly MemoryGovernanceDiagnostic[], maxDiagnostics: number): string[] {
  const renderable = diagnostics.slice(0, maxDiagnostics);
  if (renderable.length === 0) {
    return ["No diagnostics."];
  }
  return renderable.map((diagnostic) => {
    const path = diagnostic.path ? ` at ${diagnostic.path}` : "";
    return `- ${diagnostic.code}${path}: ${diagnostic.message}`;
  });
}

function compareItems(left: GovernedMemoryItem, right: GovernedMemoryItem): number {
  return (
    left.scope.localeCompare(right.scope) ||
    left.kind.localeCompare(right.kind) ||
    right.importance - left.importance ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareCandidateSummaries(left: MemoryReviewCandidateSummary, right: MemoryReviewCandidateSummary): number {
  return (
    left.scope.localeCompare(right.scope) ||
    left.kind.localeCompare(right.kind) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareDiagnostics(left: MemoryGovernanceDiagnostic, right: MemoryGovernanceDiagnostic): number {
  return (
    (left.path ?? "").localeCompare(right.path ?? "") ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function moreRestrictiveSafety(left: MemorySafetyStatus, right: MemorySafetyStatus): MemorySafetyStatus {
  return safetyRank(left) >= safetyRank(right) ? left : right;
}

function safetyRank(status: MemorySafetyStatus): number {
  return status === "safe" ? 0 : status === "needs_review" ? 1 : 2;
}

function truncate(content: string, maxContentChars: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= maxContentChars ? normalized : `${normalized.slice(0, Math.max(0, maxContentChars - 3))}...`;
}
