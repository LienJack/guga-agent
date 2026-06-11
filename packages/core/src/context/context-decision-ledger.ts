import type { CompactionBoundary, ModelInputProjection, ProjectionLedgerEntry } from "../contracts/context";
import { summarizeContextSourceMetadata } from "./context-source-metadata";

export type ContextDecisionLedger = {
  record(projection: ModelInputProjection, boundary?: CompactionBoundary): ProjectionLedgerEntry;
  list(runId?: string): ProjectionLedgerEntry[];
};

export class InMemoryContextDecisionLedger implements ContextDecisionLedger {
  private readonly entries: ProjectionLedgerEntry[] = [];

  record(projection: ModelInputProjection, boundary?: CompactionBoundary): ProjectionLedgerEntry {
    const entry: ProjectionLedgerEntry = {
      id: `ledger-${projection.id}`,
      runId: projection.runId,
      turn: projection.turn,
      projectionId: projection.id,
      sourceRefs: projection.sourceDescriptors.flatMap((source) => source.references ?? []),
      sourceDescriptors: projection.sourceDescriptors.map(({ metadata: _metadata, ...descriptor }) => descriptor),
      ...sourceMetadataSummariesFor(projection),
      policyDecisions: projection.policyDecisions,
      ...(boundary ? { compactionBoundary: boundary } : {}),
      ...(projection.hash ? { projectionHash: projection.hash } : {})
    };
    this.entries.push(entry);
    return structuredClone(entry);
  }

  list(runId?: string): ProjectionLedgerEntry[] {
    return this.entries
      .filter((entry) => !runId || entry.runId === runId)
      .map((entry) => structuredClone(entry));
  }
}

function sourceMetadataSummariesFor(
  projection: ModelInputProjection
): Pick<ProjectionLedgerEntry, "sourceMetadataSummaries"> | Record<string, never> {
  const summaries = projection.sourceDescriptors
    .map((source) => summarizeContextSourceMetadata(source))
    .filter((summary): summary is NonNullable<typeof summary> => summary !== undefined);
  return summaries.length > 0 ? { sourceMetadataSummaries: summaries } : {};
}
