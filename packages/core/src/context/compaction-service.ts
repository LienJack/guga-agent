import {
  ContextSourceKind,
  type CompactionResult,
  type ContextCompactionTrigger,
  type ContextPolicyDecision,
  type ModelInputProjection
} from "../contracts/context";
import { localSkeletonSummary } from "./compaction-summary";

export type CompactionPolicy = {
  warningThreshold: number;
  compactThreshold: number;
  minCompressionGain: number;
  maxCompactFailures: number;
  cooldownTurns: number;
  reactiveRetryLimit: number;
  summaryStripFraction: number;
  summaryStripRetryLimit: number;
  preSummaryDedup: boolean;
};

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = {
  warningThreshold: 0.7,
  compactThreshold: 0.85,
  minCompressionGain: 0.1,
  maxCompactFailures: 3,
  cooldownTurns: 2,
  reactiveRetryLimit: 1,
  summaryStripFraction: 0.2,
  summaryStripRetryLimit: 3,
  preSummaryDedup: true
};

export type CompactProjectionOptions = {
  projection: ModelInputProjection;
  trigger: ContextCompactionTrigger;
  parentSummaryRef?: string;
  iterationNo?: number;
};

export type CompactProjectionOutput = {
  result: CompactionResult;
  decisions: ContextPolicyDecision[];
};

export class CompactionService {
  compact(options: CompactProjectionOptions): CompactProjectionOutput {
    const compressible = options.projection.sourceDescriptors.filter((source) => canCompress(source));
    const retained = options.projection.sourceDescriptors.filter((source) => !canCompress(source));
    const preTokenEstimate = options.projection.budget.estimatedInputTokens;
    const postTokenEstimate = retained.reduce((total, source) => total + (source.tokenEstimate.tokens ?? 0), 0);
    const degradedTo = postTokenEstimate <= preTokenEstimate * DEFAULT_COMPACTION_POLICY.compactThreshold ? "none" : "local-skeleton";
    const cutoffSourceId = compressible.at(-1)?.id;
    const result: CompactionResult = {
      id: `compact-${options.projection.id}`,
      trigger: options.trigger,
      summary: localSkeletonSummary(options.projection),
      boundary: {
        id: `boundary-${options.projection.id}`,
        ...(options.parentSummaryRef ? { parentSummaryRef: options.parentSummaryRef } : {}),
        ...(cutoffSourceId ? { cutoffSourceId } : {}),
        retainedSourceIds: retained.map((source) => source.id),
        compactedSourceIds: compressible.map((source) => source.id)
      },
      preTokenEstimate,
      postTokenEstimate,
      iterationNo: options.iterationNo ?? 1,
      ...(options.parentSummaryRef ? { parentSummaryRef: options.parentSummaryRef } : {}),
      preprocessingApplied: {
        dedup: true,
        smartCollapse: true,
        parameterTruncation: true
      },
      strippedRoundIds: [],
      degradedTo
    };

    return {
      result,
      decisions: [{
        id: `${result.id}-decision`,
        kind: "truncate",
        phase: "context.compact.before",
        sourceIds: compressible.map((source) => source.id),
        reason: degradedTo === "none"
          ? "local preprocessing reduced estimate enough to skip summarizer"
          : "local skeleton summary used because no summarizer is installed",
        metadata: {
          trigger: options.trigger,
          degradedTo,
          preTokenEstimate,
          postTokenEstimate
        }
      }]
    };
  }
}

function canCompress(source: ModelInputProjection["sourceDescriptors"][number]): boolean {
  if (source.protected) {
    return false;
  }
  return source.kind === ContextSourceKind.History || source.kind === ContextSourceKind.ToolResultPreview;
}
