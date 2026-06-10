import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority } from "../contracts/context";
import { ModelInputProjector } from "./model-input-projection";
import { InMemoryContextDecisionLedger } from "./context-decision-ledger";

describe("InMemoryContextDecisionLedger", () => {
  it("records projection descriptors, policy decisions, references, and hashes without raw content", () => {
    const projection = new ModelInputProjector({ idFactory: () => "ledger" }).assemble({
      runId: "run-ledger",
      turn: 0,
      messages: [{ role: "tool", toolCallId: "call-1", name: "read", content: "preview", isError: false }],
      tools: []
    });
    const ledger = new InMemoryContextDecisionLedger();
    const entry = ledger.record(projection, {
      id: "boundary-1",
      retainedSourceIds: ["message-0"],
      compactedSourceIds: []
    });

    expect(entry).toMatchObject({
      runId: "run-ledger",
      projectionId: "projection-ledger",
      projectionHash: expect.objectContaining({ algorithm: "sha256" }),
      compactionBoundary: { id: "boundary-1" }
    });
    expect(entry.sourceRefs[0]).toMatchObject({ type: "tool-result", id: "call-1" });
    expect(ledger.list("run-ledger")).toHaveLength(1);
  });

  it("keeps safe attention metadata summaries while omitting raw metadata content", () => {
    const projection = new ModelInputProjector({ idFactory: () => "ledger-attention" }).assemble({
      runId: "run-ledger",
      turn: 1,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      additionalSources: [{
        id: "memory-candidate",
        kind: ContextSourceKind.MemoryCandidate,
        priority: ContextSourcePriority.Low,
        provenance: { origin: "core" },
        tokenEstimate: { status: "estimated", tokens: 1 },
        references: [{ type: "message", id: "message-0" }],
        modelVisible: false,
        metadata: {
          ontology: ContextSourceKind.MemoryCandidate,
          sensitivity: "sensitive",
          confidence: "medium",
          scope: "session",
          intendedUsage: ["memory-review", "audit"],
          rawCandidateText: "never write this into the ledger",
          candidates: [{
            candidateId: "candidate-1",
            rawCandidateTextIncluded: false
          }]
        }
      }]
    });

    const entry = new InMemoryContextDecisionLedger().record(projection);

    expect(entry.sourceMetadataSummaries).toEqual([
      expect.objectContaining({
        sourceId: "memory-candidate",
        kind: ContextSourceKind.MemoryCandidate,
        sensitivity: "sensitive",
        confidence: "medium",
        scope: "session",
        intendedUsage: ["audit", "memory-review"],
        candidateCount: 1
      })
    ]);
    expect(JSON.stringify(entry)).not.toContain("never write this into the ledger");
  });
});
