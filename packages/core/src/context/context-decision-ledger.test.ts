import { describe, expect, it } from "vitest";
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
});
