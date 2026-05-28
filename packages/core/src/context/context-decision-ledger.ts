import type { CompactionBoundary, ModelInputProjection, ProjectionLedgerEntry } from "../contracts/context";

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
