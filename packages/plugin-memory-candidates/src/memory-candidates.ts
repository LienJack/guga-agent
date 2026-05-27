export type MemoryCandidateScope = "user" | "project" | "workspace" | "session";
export type MemoryCandidateKind = "preference" | "fact" | "decision" | "workflow" | "constraint";
export type MemoryCandidateStatus = "proposed" | "accepted" | "rejected";
export type MemorySafetyStatus = "safe" | "needs_review" | "blocked";

export type MemorySourceReference = {
  eventId: string;
  sessionId?: string;
  runId?: string;
  turn?: number;
  artifactId?: string;
};

export type MemorySafetyVerdict = {
  status: MemorySafetyStatus;
  reasons: string[];
};

export type MemoryCandidate = {
  id: string;
  scope: MemoryCandidateScope;
  kind: MemoryCandidateKind;
  content: string;
  confidence: number;
  importance: number;
  status: MemoryCandidateStatus;
  createdAt: string;
  sourceRefs: MemorySourceReference[];
  safety: MemorySafetyVerdict;
  tags?: string[];
};

export type MemoryCandidateDiagnostic = {
  code: string;
  message: string;
  path?: string;
};

export type MemoryCandidateLedger = {
  candidates: MemoryCandidate[];
  diagnostics: MemoryCandidateDiagnostic[];
  counts: Record<MemoryCandidateStatus, number>;
};

export type RenderMemoryContextOptions = {
  maxItems?: number;
  maxContentChars?: number;
  includeSourceRefs?: boolean;
  title?: string;
};

const scopes: MemoryCandidateScope[] = ["user", "project", "workspace", "session"];
const kinds: MemoryCandidateKind[] = ["preference", "fact", "decision", "workflow", "constraint"];
const statuses: MemoryCandidateStatus[] = ["proposed", "accepted", "rejected"];
const safetyStatuses: MemorySafetyStatus[] = ["safe", "needs_review", "blocked"];

const injectionPatterns = [
  /ignore (all )?(previous|prior|above) (instructions|rules)/i,
  /disregard (all )?(previous|prior|above) (instructions|rules)/i,
  /system prompt/i,
  /developer message/i,
  /you are now/i,
  /reveal (the )?(prompt|system)/i
];

const invisibleControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/u;

export function scanMemoryCandidateContent(content: string): MemorySafetyVerdict {
  const reasons: string[] = [];
  if (invisibleControls.test(content)) {
    reasons.push("invisible-control-characters");
  }
  if (injectionPatterns.some((pattern) => pattern.test(content))) {
    reasons.push("prompt-injection-like-content");
  }
  if (content.length > 2000) {
    reasons.push("content-too-long");
  }
  return {
    status: reasons.length === 0 ? "safe" : reasons.includes("prompt-injection-like-content") ? "blocked" : "needs_review",
    reasons
  };
}

export function validateMemoryCandidate(candidate: unknown): MemoryCandidateDiagnostic[] {
  const diagnostics: MemoryCandidateDiagnostic[] = [];
  if (!isRecord(candidate)) {
    return [{ code: "MEMORY_CANDIDATE_NOT_OBJECT", message: "Memory candidate must be an object" }];
  }
  requireString(candidate.id, "id", diagnostics);
  requireEnum(candidate.scope, scopes, "scope", diagnostics);
  requireEnum(candidate.kind, kinds, "kind", diagnostics);
  requireString(candidate.content, "content", diagnostics);
  requireNumberRange(candidate.confidence, 0, 1, "confidence", diagnostics);
  requireNumberRange(candidate.importance, 0, 1, "importance", diagnostics);
  requireEnum(candidate.status, statuses, "status", diagnostics);
  requireIsoDate(candidate.createdAt, "createdAt", diagnostics);
  if (!Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length === 0) {
    diagnostics.push({ code: "MEMORY_SOURCE_REFS_REQUIRED", message: "At least one source reference is required", path: "sourceRefs" });
  } else {
    candidate.sourceRefs.forEach((source, index) => validateSourceRef(source, `sourceRefs[${index}]`, diagnostics));
  }
  validateSafety(candidate.safety, diagnostics);
  return diagnostics;
}

export function createMemoryCandidate(input: Omit<MemoryCandidate, "safety"> & { safety?: MemorySafetyVerdict }): MemoryCandidate {
  return {
    ...input,
    safety: input.safety ?? scanMemoryCandidateContent(input.content)
  };
}

export function createMemoryCandidateLedger(candidates: readonly MemoryCandidate[]): MemoryCandidateLedger {
  const diagnostics = candidates.flatMap((candidate) =>
    validateMemoryCandidate(candidate).map((diagnostic) => ({
      ...diagnostic,
      path: diagnostic.path ? `${candidate.id}.${diagnostic.path}` : candidate.id
    }))
  );
  const sorted = [...candidates].sort(compareCandidates);
  return {
    candidates: sorted,
    diagnostics,
    counts: Object.fromEntries(statuses.map((status) => [status, candidates.filter((candidate) => candidate.status === status).length])) as Record<MemoryCandidateStatus, number>
  };
}

export function renderMemoryContextBlock(candidates: readonly MemoryCandidate[], options: RenderMemoryContextOptions = {}): string {
  const maxItems = options.maxItems ?? 8;
  const maxContentChars = options.maxContentChars ?? 240;
  const title = options.title ?? "Memory Candidates";
  const safeAccepted = candidates
    .filter((candidate) => candidate.status === "accepted" && candidate.safety.status === "safe")
    .sort(compareCandidates)
    .slice(0, maxItems);

  if (safeAccepted.length === 0) {
    return `## ${title}\n\nNo accepted safe memory candidates.`;
  }

  const lines = safeAccepted.map((candidate) => {
    const source = options.includeSourceRefs
      ? ` [source:${candidate.sourceRefs.map((ref) => ref.eventId).join(",")}]`
      : "";
    return `- (${candidate.scope}/${candidate.kind}, ${candidate.confidence.toFixed(2)}) ${truncate(candidate.content, maxContentChars)}${source}`;
  });
  return [`## ${title}`, "", ...lines].join("\n");
}

function compareCandidates(left: MemoryCandidate, right: MemoryCandidate): number {
  return (
    left.scope.localeCompare(right.scope) ||
    statusRank(left.status) - statusRank(right.status) ||
    right.importance - left.importance ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function statusRank(status: MemoryCandidateStatus): number {
  return status === "accepted" ? 0 : status === "proposed" ? 1 : 2;
}

function truncate(content: string, maxContentChars: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= maxContentChars ? normalized : `${normalized.slice(0, Math.max(0, maxContentChars - 3))}...`;
}

function validateSourceRef(input: unknown, path: string, diagnostics: MemoryCandidateDiagnostic[]): void {
  if (!isRecord(input)) {
    diagnostics.push({ code: "MEMORY_SOURCE_REF_NOT_OBJECT", message: "Source reference must be an object", path });
    return;
  }
  requireString(input.eventId, `${path}.eventId`, diagnostics);
  const turn = input.turn;
  if (turn !== undefined && (typeof turn !== "number" || !Number.isInteger(turn) || turn < 0)) {
    diagnostics.push({ code: "MEMORY_SOURCE_TURN_INVALID", message: "Source turn must be a non-negative integer", path: `${path}.turn` });
  }
}

function validateSafety(input: unknown, diagnostics: MemoryCandidateDiagnostic[]): void {
  if (!isRecord(input)) {
    diagnostics.push({ code: "MEMORY_SAFETY_REQUIRED", message: "Safety verdict is required", path: "safety" });
    return;
  }
  requireEnum(input.status, safetyStatuses, "safety.status", diagnostics);
  if (!Array.isArray(input.reasons) || input.reasons.some((reason) => typeof reason !== "string")) {
    diagnostics.push({ code: "MEMORY_SAFETY_REASONS_INVALID", message: "Safety reasons must be strings", path: "safety.reasons" });
  }
}

function requireString(input: unknown, path: string, diagnostics: MemoryCandidateDiagnostic[]): void {
  if (typeof input !== "string" || !input.trim()) {
    diagnostics.push({ code: "MEMORY_STRING_REQUIRED", message: `${path} is required`, path });
  }
}

function requireEnum<T extends string>(input: unknown, values: readonly T[], path: string, diagnostics: MemoryCandidateDiagnostic[]): void {
  if (typeof input !== "string" || !values.includes(input as T)) {
    diagnostics.push({ code: "MEMORY_ENUM_INVALID", message: `${path} must be one of: ${values.join(", ")}`, path });
  }
}

function requireNumberRange(input: unknown, min: number, max: number, path: string, diagnostics: MemoryCandidateDiagnostic[]): void {
  if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) {
    diagnostics.push({ code: "MEMORY_NUMBER_RANGE_INVALID", message: `${path} must be between ${min} and ${max}`, path });
  }
}

function requireIsoDate(input: unknown, path: string, diagnostics: MemoryCandidateDiagnostic[]): void {
  if (typeof input !== "string" || Number.isNaN(Date.parse(input))) {
    diagnostics.push({ code: "MEMORY_DATE_INVALID", message: `${path} must be an ISO-like date string`, path });
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
