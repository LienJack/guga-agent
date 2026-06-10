import type {
  ContextSourceConfidence,
  ContextSourceDescriptor,
  ContextSourceIntendedUsage,
  ContextSourceMetadataSummary,
  ContextSourceScope,
  ContextSourceSensitivity
} from "../contracts/context";

const sensitivities: ContextSourceSensitivity[] = ["public", "internal", "sensitive", "secret"];
const confidences: ContextSourceConfidence[] = ["low", "medium", "high"];
const scopes: ContextSourceScope[] = ["turn", "run", "session", "workspace", "cross-session"];
const intendedUsages: ContextSourceIntendedUsage[] = [
  "provider-input",
  "compaction-continuity",
  "audit",
  "replay",
  "memory-review"
];

export function summarizeContextSourceMetadata(source: ContextSourceDescriptor): ContextSourceMetadataSummary | undefined {
  const metadata = source.metadata;
  if (!metadata) {
    return undefined;
  }

  const summary: ContextSourceMetadataSummary = {
    sourceId: source.id,
    kind: source.kind
  };
  if (typeof metadata.ontology === "string") {
    summary.ontology = metadata.ontology;
  }
  if (isSensitivity(metadata.sensitivity)) {
    summary.sensitivity = metadata.sensitivity;
  }
  if (isConfidence(metadata.confidence)) {
    summary.confidence = metadata.confidence;
  }
  if (isScope(metadata.scope)) {
    summary.scope = metadata.scope;
  }
  const usage = Array.isArray(metadata.intendedUsage)
    ? metadata.intendedUsage.filter(isIntendedUsage)
    : [];
  if (usage.length > 0) {
    summary.intendedUsage = Array.from(new Set(usage)).sort();
  }
  if (Array.isArray(metadata.items)) {
    const itemKinds = metadata.items
      .map((item) => (isRecord(item) && typeof item.kind === "string" ? item.kind : undefined))
      .filter((kind): kind is string => typeof kind === "string");
    if (itemKinds.length > 0) {
      summary.itemKinds = Array.from(new Set(itemKinds)).sort();
    }
  }
  if (Array.isArray(metadata.candidates)) {
    summary.candidateCount = metadata.candidates.length;
  }

  return hasSummaryPayload(summary) ? summary : undefined;
}

function hasSummaryPayload(summary: ContextSourceMetadataSummary): boolean {
  return summary.ontology !== undefined ||
    summary.sensitivity !== undefined ||
    summary.confidence !== undefined ||
    summary.scope !== undefined ||
    summary.intendedUsage !== undefined ||
    summary.itemKinds !== undefined ||
    summary.candidateCount !== undefined;
}

function isSensitivity(input: unknown): input is ContextSourceSensitivity {
  return typeof input === "string" && sensitivities.includes(input as ContextSourceSensitivity);
}

function isConfidence(input: unknown): input is ContextSourceConfidence {
  return typeof input === "string" && confidences.includes(input as ContextSourceConfidence);
}

function isScope(input: unknown): input is ContextSourceScope {
  return typeof input === "string" && scopes.includes(input as ContextSourceScope);
}

function isIntendedUsage(input: unknown): input is ContextSourceIntendedUsage {
  return typeof input === "string" && intendedUsages.includes(input as ContextSourceIntendedUsage);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
