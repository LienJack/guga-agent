import {
  ContextSourcePriority,
  ContextSourceKind,
  type CompactionResult,
  type ContextSourceDescriptor,
  type ModelInputProjection
} from "../contracts/context";
import type { CoreMessage } from "../contracts/messages";
import { estimateTextTokens } from "./context-budgeter";

export function compactedRetryMessages(
  projection: ModelInputProjection,
  compaction: CompactionResult,
  reinjectedSources: readonly ContextSourceDescriptor[] = []
): CoreMessage[] {
  const compacted = new Set(compaction.boundary.compactedSourceIds);
  const compactedIndexes = new Set(
    projection.sourceDescriptors
      .filter((source) => compacted.has(source.id))
      .flatMap((source) => source.messageIndexes ?? [])
  );
  const retained = projection.messages.filter((_message, index) => !compactedIndexes.has(index));
  const insertAt = Math.max(
    0,
    retained.findIndex((message) => message.role === "user")
  );
  const summary: CoreMessage = {
    role: "user",
    content: compactedSummaryContent(compaction)
  };

  return [
    ...retained.slice(0, insertAt),
    summary,
    ...reinjectedSources
      .filter((source) => source.modelVisible)
      .map((source) => reinjectedSourceMessage(source)),
    ...retained.slice(insertAt)
  ];
}

export function compactedSummaryContent(compaction: CompactionResult): string {
  return [
    "[Compaction summary: historical/task context]",
    `Objective: ${compaction.summary.objective}`,
    `Completed work: ${emptyOrJoined(compaction.summary.completedWork)}`,
    `Current blockers: ${emptyOrJoined(compaction.summary.currentBlockers)}`,
    `Next steps: ${emptyOrJoined(compaction.summary.nextSteps)}`,
    `Key files/symbols: ${emptyOrJoined(compaction.summary.keyFilesAndSymbols)}`,
    `Tool result refs: ${emptyOrJoined(compaction.summary.toolResultReferences.map((reference) => reference.id))}`,
    `Unresolved questions: ${emptyOrJoined(compaction.summary.unresolvedQuestions)}`,
    `User constraints: ${emptyOrJoined(compaction.summary.userConstraints)}`,
    `Boundary: ${compaction.boundary.id}`
  ].join("\n");
}

export function compactionSummarySource(compaction: CompactionResult): ContextSourceDescriptor {
  const content = compactedSummaryContent(compaction);
  return {
    id: compaction.id,
    kind: ContextSourceKind.CompactionSummary,
    priority: ContextSourcePriority.Medium,
    provenance: {
      origin: "summary",
      metadata: {
        boundaryId: compaction.boundary.id,
        iterationNo: compaction.iterationNo,
        degradedTo: compaction.degradedTo
      }
    },
    tokenEstimate: { status: "estimated", tokens: estimateTextTokens(content) },
    contentHash: simpleContentHash(content),
    modelVisible: true,
    references: [{
      type: "host-reference",
      id: compaction.boundary.id,
      label: "Compaction boundary"
    }]
  };
}

export function compactedRetryPolicyDecisions(projection: ModelInputProjection, compaction: CompactionResult) {
  return [
    ...projection.policyDecisions,
    {
      id: `${compaction.id}-retry`,
      kind: "reinjection" as const,
      phase: "context.reinject",
      sourceIds: [ContextSourceKind.CompactionSummary],
      reason: "retry projection includes compacted summary and omits compacted sources",
      metadata: {
        boundaryId: compaction.boundary.id,
        compactedSourceIds: compaction.boundary.compactedSourceIds
      }
    }
  ];
}

function emptyOrJoined(values: readonly string[]): string {
  return values.length === 0 ? "unknown" : values.join("; ");
}

function reinjectedSourceMessage(source: ContextSourceDescriptor): CoreMessage {
  const content = typeof source.metadata?.content === "string"
    ? source.metadata.content
    : `[Reinjected ${source.kind}: ${source.id}]`;
  return {
    role: "user",
    content: content.startsWith("[Reinjected ")
      ? content
      : `[Reinjected ${source.kind}: ${source.id}]\n${content}`
  };
}

function simpleContentHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
