import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority, type ModelInputProjection } from "../contracts/context";
import { CompactionService } from "./compaction-service";

describe("CompactionService", () => {
  it("runs local preprocessing and can skip summarizer when estimate falls below threshold", () => {
    const projection = projectionFixture();
    const output = new CompactionService().compact({ projection, trigger: "proactive-threshold" });

    expect(output.result).toMatchObject({
      trigger: "proactive-threshold",
      summary: expect.objectContaining({
        objective: "finish M4",
        completedWork: [],
        currentBlockers: [],
        nextSteps: [],
        unresolvedQuestions: [],
        userConstraints: []
      }),
      preprocessingApplied: { dedup: true, smartCollapse: true, parameterTruncation: true },
      degradedTo: "none"
    });
    expect(output.result.boundary.compactedSourceIds).toEqual(["old-history"]);
    expect(output.decisions[0]).toMatchObject({
      phase: "context.compact.before",
      sourceIds: ["old-history"]
    });
  });

  it("preserves parent summary lineage on repeated compaction", () => {
    const projection = projectionFixture();
    const output = new CompactionService().compact({
      projection,
      trigger: "provider-overflow",
      parentSummaryRef: "compact-parent",
      iterationNo: 2
    });

    expect(output.result).toMatchObject({
      iterationNo: 2,
      parentSummaryRef: "compact-parent",
      boundary: expect.objectContaining({ parentSummaryRef: "compact-parent" }),
      strippedRoundIds: []
    });
  });

  it("marks local skeleton degradation when retained sources remain over the threshold", () => {
    const projection = projectionFixture({
      retainedTokens: 110,
      historyTokens: 10
    });

    const output = new CompactionService().compact({ projection, trigger: "proactive-threshold" });

    expect(output.result.degradedTo).toBe("local-skeleton");
    expect(output.decisions[0]).toMatchObject({
      metadata: expect.objectContaining({ degradedTo: "local-skeleton" })
    });
  });
});

function projectionFixture(options: { retainedTokens?: number; historyTokens?: number } = {}): ModelInputProjection {
  return {
    id: "projection-1",
    runId: "run-1",
    turn: 0,
    messages: [{ role: "user", content: "finish M4" }],
    tools: [],
    sourceDescriptors: [
      {
        id: "pending",
        kind: ContextSourceKind.PendingTurn,
        priority: ContextSourcePriority.High,
        provenance: { origin: "core" },
        tokenEstimate: { status: "estimated", tokens: options.retainedTokens ?? 10 },
        modelVisible: true,
        protected: true
      },
      {
        id: "old-history",
        kind: ContextSourceKind.History,
        priority: ContextSourcePriority.Low,
        provenance: { origin: "core" },
        tokenEstimate: { status: "estimated", tokens: options.historyTokens ?? 100 },
        modelVisible: true
      }
    ],
    budget: {
      contextWindow: 120,
      reservedOutputTokens: 10,
      usableInputTokens: 110,
      estimatedInputTokens: 110,
      estimateStatus: "complete",
      warningThreshold: 0.7,
      compactThreshold: 0.85
    },
    pressure: {
      id: "pressure-1",
      level: "compact",
      reason: "over threshold",
      budget: {
        contextWindow: 120,
        reservedOutputTokens: 10,
        usableInputTokens: 110,
        estimatedInputTokens: 110,
        estimateStatus: "complete",
        warningThreshold: 0.7,
        compactThreshold: 0.85
      },
      sourceIds: ["pending", "old-history"]
    },
    policyDecisions: []
  };
}
