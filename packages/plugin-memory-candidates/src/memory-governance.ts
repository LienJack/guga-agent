import {
  scanMemoryCandidateContent,
  validateMemoryCandidate,
  type MemoryCandidate,
  type MemoryCandidateDiagnostic,
  type MemoryCandidateKind,
  type MemoryCandidateScope,
  type MemorySafetyVerdict,
  type MemorySourceReference
} from "./memory-candidates";

export type MemoryDecisionAction = "accept" | "reject" | "supersede";
export type MemoryReviewerType = "user" | "agent" | "system";

export type MemoryDecisionReviewer = {
  type: MemoryReviewerType;
  id: string;
};

export type MemoryDecision = {
  id: string;
  candidateId: string;
  action: MemoryDecisionAction;
  decidedAt: string;
  reviewer: MemoryDecisionReviewer;
  reason: string;
  itemId?: string;
  supersedesItemId?: string;
};

export type MemoryItemStatus = "active" | "superseded";

export type GovernedMemoryItem = {
  id: string;
  candidateId: string;
  scope: MemoryCandidateScope;
  kind: MemoryCandidateKind;
  content: string;
  confidence: number;
  importance: number;
  status: MemoryItemStatus;
  createdAt: string;
  updatedAt: string;
  sourceRefs: MemorySourceReference[];
  safety: MemorySafetyVerdict;
  acceptedByDecisionId: string;
  supersededByDecisionId?: string;
  supersedesItemId?: string;
  tags?: string[];
};

export type MemoryGovernanceDiagnostic = MemoryCandidateDiagnostic;

export type MemoryGovernanceLedger = {
  candidates: MemoryCandidate[];
  items: GovernedMemoryItem[];
  decisions: MemoryDecision[];
  diagnostics: MemoryGovernanceDiagnostic[];
  counts: Record<MemoryItemStatus, number> & { rejected: number };
};

export type MemoryScopeFilter = {
  scope: MemoryCandidateScope;
  kind?: MemoryCandidateKind;
  includeSuperseded?: boolean;
  tags?: string[];
};

export type RenderGovernedMemoryOptions = {
  maxItems?: number;
  maxContentChars?: number;
  includeSourceRefs?: boolean;
  title?: string;
};

const decisionActions: MemoryDecisionAction[] = ["accept", "reject", "supersede"];
const reviewerTypes: MemoryReviewerType[] = ["user", "agent", "system"];

export function validateMemoryDecision(decision: unknown): MemoryGovernanceDiagnostic[] {
  const diagnostics: MemoryGovernanceDiagnostic[] = [];
  if (!isRecord(decision)) {
    return [{ code: "MEMORY_DECISION_NOT_OBJECT", message: "Memory decision must be an object" }];
  }
  requireString(decision.id, "id", diagnostics);
  requireString(decision.candidateId, "candidateId", diagnostics);
  requireEnum(decision.action, decisionActions, "action", diagnostics);
  requireIsoDate(decision.decidedAt, "decidedAt", diagnostics);
  validateReviewer(decision.reviewer, diagnostics);
  requireString(decision.reason, "reason", diagnostics);
  if (decision.itemId !== undefined) {
    requireString(decision.itemId, "itemId", diagnostics);
  }
  if (decision.supersedesItemId !== undefined) {
    requireString(decision.supersedesItemId, "supersedesItemId", diagnostics);
  }
  if (decision.action === "supersede" && typeof decision.supersedesItemId !== "string") {
    diagnostics.push({
      code: "MEMORY_DECISION_SUPERSEDES_REQUIRED",
      message: "supersede decisions must name an item to supersede",
      path: "supersedesItemId"
    });
  }
  return diagnostics;
}

export function createMemoryGovernanceLedger(
  candidates: readonly MemoryCandidate[],
  decisions: readonly MemoryDecision[]
): MemoryGovernanceLedger {
  const diagnostics: MemoryGovernanceDiagnostic[] = [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const sortedDecisions = [...decisions].sort(compareDecisions);
  const itemsById = new Map<string, GovernedMemoryItem>();
  const rejectedCandidateIds = new Set<string>();
  const seenDecisionIds = new Set<string>();

  for (const candidate of candidates) {
    diagnostics.push(...prefixDiagnostics(validateMemoryCandidate(candidate), `candidate.${candidate.id}`));
  }

  for (const decision of sortedDecisions) {
    const decisionPath = `decision.${decision.id || "<missing>"}`;
    const decisionDiagnostics = validateMemoryDecision(decision);
    diagnostics.push(...prefixDiagnostics(decisionDiagnostics, decisionPath));
    if (decisionDiagnostics.length > 0) {
      continue;
    }
    if (seenDecisionIds.has(decision.id)) {
      diagnostics.push({
        code: "MEMORY_DECISION_DUPLICATE_ID",
        message: "Decision ids must be unique",
        path: decisionPath
      });
      continue;
    }
    seenDecisionIds.add(decision.id);

    const candidate = candidateById.get(decision.candidateId);
    if (!candidate) {
      diagnostics.push({
        code: "MEMORY_DECISION_UNKNOWN_CANDIDATE",
        message: "Decision references an unknown candidate",
        path: `${decisionPath}.candidateId`
      });
      continue;
    }

    if (decision.action === "reject") {
      rejectedCandidateIds.add(decision.candidateId);
      for (const [itemId, item] of itemsById) {
        if (item.candidateId === decision.candidateId) {
          itemsById.delete(itemId);
        }
      }
      continue;
    }

    if (!isGovernableCandidate(candidate)) {
      diagnostics.push({
        code: "MEMORY_DECISION_CANDIDATE_NOT_GOVERNABLE",
        message: "Accepted memory decisions require a valid, non-rejected, safe candidate",
        path: `${decisionPath}.candidateId`
      });
      continue;
    }

    const itemId = decision.itemId ?? `memory:${candidate.id}`;

    if (decision.action === "supersede") {
      const supersedesItemId = decision.supersedesItemId;
      if (!supersedesItemId) {
        continue;
      }
      const target = itemsById.get(supersedesItemId);
      if (!target) {
        diagnostics.push({
          code: "MEMORY_DECISION_UNKNOWN_SUPERSEDED_ITEM",
          message: "Supersede decision references an unknown memory item",
          path: `${decisionPath}.supersedesItemId`
        });
        continue;
      }
      itemsById.set(target.id, {
        ...target,
        status: "superseded",
        updatedAt: decision.decidedAt,
        supersededByDecisionId: decision.id
      });
    }

    const item = createGovernedItem(candidate, decision, itemId);
    itemsById.set(item.id, item);
  }

  const items = [...itemsById.values()].sort(compareItems);
  return {
    candidates: [...candidates].sort(compareCandidates),
    items,
    decisions: sortedDecisions,
    diagnostics,
    counts: {
      active: items.filter((item) => item.status === "active").length,
      superseded: items.filter((item) => item.status === "superseded").length,
      rejected: rejectedCandidateIds.size
    }
  };
}

export function listMemoryItemsByScope(
  ledger: MemoryGovernanceLedger,
  filter: MemoryScopeFilter
): GovernedMemoryItem[] {
  return ledger.items
    .filter((item) => item.scope === filter.scope)
    .filter((item) => filter.includeSuperseded || item.status === "active")
    .filter((item) => filter.kind === undefined || item.kind === filter.kind)
    .filter((item) => tagsMatch(item.tags, filter.tags))
    .sort(compareItems);
}

export function renderGovernedMemoryBlock(
  items: readonly GovernedMemoryItem[],
  options: RenderGovernedMemoryOptions = {}
): string {
  const maxItems = options.maxItems ?? 8;
  const maxContentChars = options.maxContentChars ?? 240;
  const title = options.title ?? "Governed Memory";
  const renderable = items
    .filter((item) => isRenderableGovernedItem(item))
    .sort(compareItems)
    .slice(0, maxItems);

  if (renderable.length === 0) {
    return `## ${title}\n\nNo active safe memory items.`;
  }

  const lines = renderable.map((item) => {
    const source = options.includeSourceRefs
      ? ` [source:${item.sourceRefs.map((ref) => ref.eventId).join(",")}]`
      : "";
    return `- (${item.scope}/${item.kind}, ${item.confidence.toFixed(2)}) ${truncate(item.content, maxContentChars)}${source}`;
  });
  return [`## ${title}`, "", ...lines].join("\n");
}

function createGovernedItem(candidate: MemoryCandidate, decision: MemoryDecision, itemId: string): GovernedMemoryItem {
  return {
    id: itemId,
    candidateId: candidate.id,
    scope: candidate.scope,
    kind: candidate.kind,
    content: candidate.content,
    confidence: candidate.confidence,
    importance: candidate.importance,
    status: "active",
    createdAt: decision.decidedAt,
    updatedAt: decision.decidedAt,
    sourceRefs: candidate.sourceRefs,
    safety: candidate.safety,
    acceptedByDecisionId: decision.id,
    ...(decision.supersedesItemId ? { supersedesItemId: decision.supersedesItemId } : {}),
    ...(candidate.tags ? { tags: candidate.tags } : {})
  };
}

function isGovernableCandidate(candidate: MemoryCandidate): boolean {
  return (
    candidate.status !== "rejected" &&
    candidate.safety.status === "safe" &&
    scanMemoryCandidateContent(candidate.content).status === "safe" &&
    validateMemoryCandidate(candidate).length === 0
  );
}

function isRenderableGovernedItem(item: GovernedMemoryItem): boolean {
  return (
    item.status === "active" &&
    item.safety.status === "safe" &&
    item.id.trim().length > 0 &&
    item.candidateId.trim().length > 0 &&
    item.content.trim().length > 0 &&
    item.sourceRefs.length > 0 &&
    item.sourceRefs.every((sourceRef) => sourceRef.eventId.trim().length > 0) &&
    scanMemoryCandidateContent(item.content).status === "safe"
  );
}

function compareDecisions(left: MemoryDecision, right: MemoryDecision): number {
  return left.decidedAt.localeCompare(right.decidedAt) || left.id.localeCompare(right.id);
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

function compareCandidates(left: MemoryCandidate, right: MemoryCandidate): number {
  return (
    left.scope.localeCompare(right.scope) ||
    left.kind.localeCompare(right.kind) ||
    right.importance - left.importance ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function tagsMatch(itemTags: readonly string[] | undefined, filterTags: readonly string[] | undefined): boolean {
  if (!filterTags || filterTags.length === 0) {
    return true;
  }
  const tags = new Set(itemTags ?? []);
  return filterTags.every((tag) => tags.has(tag));
}

function prefixDiagnostics(diagnostics: MemoryGovernanceDiagnostic[], prefix: string): MemoryGovernanceDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    path: diagnostic.path ? `${prefix}.${diagnostic.path}` : prefix
  }));
}

function truncate(content: string, maxContentChars: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= maxContentChars ? normalized : `${normalized.slice(0, Math.max(0, maxContentChars - 3))}...`;
}

function validateReviewer(input: unknown, diagnostics: MemoryGovernanceDiagnostic[]): void {
  if (!isRecord(input)) {
    diagnostics.push({ code: "MEMORY_DECISION_REVIEWER_REQUIRED", message: "Decision reviewer is required", path: "reviewer" });
    return;
  }
  requireEnum(input.type, reviewerTypes, "reviewer.type", diagnostics);
  requireString(input.id, "reviewer.id", diagnostics);
}

function requireString(input: unknown, path: string, diagnostics: MemoryGovernanceDiagnostic[]): void {
  if (typeof input !== "string" || !input.trim()) {
    diagnostics.push({ code: "MEMORY_STRING_REQUIRED", message: `${path} is required`, path });
  }
}

function requireEnum<T extends string>(input: unknown, values: readonly T[], path: string, diagnostics: MemoryGovernanceDiagnostic[]): void {
  if (typeof input !== "string" || !values.includes(input as T)) {
    diagnostics.push({ code: "MEMORY_ENUM_INVALID", message: `${path} must be one of: ${values.join(", ")}`, path });
  }
}

function requireIsoDate(input: unknown, path: string, diagnostics: MemoryGovernanceDiagnostic[]): void {
  if (typeof input !== "string" || Number.isNaN(Date.parse(input))) {
    diagnostics.push({ code: "MEMORY_DATE_INVALID", message: `${path} must be an ISO-like date string`, path });
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
