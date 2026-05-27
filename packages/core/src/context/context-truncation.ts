import {
  ContextSourceKind,
  type ContextPolicyDecision,
  type ContextSourceDescriptor
} from "../contracts/context";

export type TruncateContextSourcesOptions = {
  sources: readonly ContextSourceDescriptor[];
  targetTokenEstimate: number;
};

export type TruncateContextSourcesResult = {
  retained: ContextSourceDescriptor[];
  snipped: ContextSourceDescriptor[];
  decisions: ContextPolicyDecision[];
};

export function truncateContextSources(options: TruncateContextSourcesOptions): TruncateContextSourcesResult {
  const retained = [...options.sources];
  const snipped: ContextSourceDescriptor[] = [];

  while (estimatedTokens(retained) > options.targetTokenEstimate) {
    const candidateIndex = retained.findIndex((source) => canSnip(source));
    if (candidateIndex === -1) {
      break;
    }
    const [candidate] = retained.splice(candidateIndex, 1);
    if (candidate) {
      snipped.push(candidate);
    }
  }

  return {
    retained,
    snipped,
    decisions: snipped.length === 0
      ? []
      : [{
          id: "context-truncation",
          kind: "truncate",
          phase: "context.truncate",
          sourceIds: snipped.map((source) => source.id),
          reason: "snipped low-priority model-visible sources to reduce projection pressure"
        }]
  };
}

function canSnip(source: ContextSourceDescriptor): boolean {
  if (source.protected) {
    return false;
  }
  return source.kind === ContextSourceKind.ToolResultPreview || source.kind === ContextSourceKind.History;
}

function estimatedTokens(sources: readonly ContextSourceDescriptor[]): number {
  return sources.reduce((total, source) => total + (source.tokenEstimate.tokens ?? 0), 0);
}
