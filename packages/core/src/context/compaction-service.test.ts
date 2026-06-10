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

  it("uses state and trace descriptors to preserve continuity fields in the local summary", () => {
    const projection = projectionFixture({
      messages: [
        { role: "user", content: "finish M4 without promoting summaries to system authority?" },
        { role: "user", content: "Next, run replay tests." }
      ],
      extraSources: [
        stateDescriptor(),
        traceDescriptor()
      ]
    });

    const output = new CompactionService().compact({ projection, trigger: "provider-overflow" });

    expect(output.result.summary).toMatchObject({
      objective: "finish M4 without promoting summaries to system authority?",
      userConstraints: ["finish M4 without promoting summaries to system authority?"],
      unresolvedQuestions: ["finish M4 without promoting summaries to system authority?"],
      nextSteps: ["Next, run replay tests."],
      completedWork: expect.arrayContaining(["tool returned observation"])
    });
    expect(output.result.quality).toMatchObject({
      continuitySourceIds: ["state-current", "trace-current"],
      retainedSourceCount: expect.any(Number),
      compactedSourceCount: expect.any(Number)
    });
  });
});

function projectionFixture(options: {
  retainedTokens?: number;
  historyTokens?: number;
  messages?: ModelInputProjection["messages"];
  extraSources?: ModelInputProjection["sourceDescriptors"];
} = {}): ModelInputProjection {
  return {
    id: "projection-1",
    runId: "run-1",
    turn: 0,
    messages: options.messages ?? [{ role: "user", content: "finish M4" }],
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
      },
      ...(options.extraSources ?? [])
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

function stateDescriptor(): ModelInputProjection["sourceDescriptors"][number] {
  return {
    id: "state-current",
    kind: ContextSourceKind.StateProjection,
    priority: ContextSourcePriority.High,
    provenance: { origin: "core" },
    tokenEstimate: { status: "estimated", tokens: 4 },
    modelVisible: false,
    metadata: {
      ontology: ContextSourceKind.StateProjection,
      sensitivity: "internal",
      confidence: "high",
      scope: "run",
      intendedUsage: ["compaction-continuity"],
      generatedFromSourceIds: ["message-0", "message-1"],
      items: [
        stateItem("objective", "current objective", "message-0"),
        stateItem("constraint", "user constraint", "message-0"),
        stateItem("open_question", "open question", "message-0"),
        stateItem("next_step", "next step", "message-1")
      ]
    }
  };
}

function traceDescriptor(): ModelInputProjection["sourceDescriptors"][number] {
  return {
    id: "trace-current",
    kind: ContextSourceKind.AccountableTrace,
    priority: ContextSourcePriority.Medium,
    provenance: { origin: "core" },
    tokenEstimate: { status: "estimated", tokens: 3 },
    modelVisible: false,
    metadata: {
      ontology: ContextSourceKind.AccountableTrace,
      sensitivity: "internal",
      confidence: "medium",
      scope: "run",
      intendedUsage: ["audit"],
      generatedFromSourceIds: ["message-0"],
      generatedFromDecisionIds: [],
      items: [{
        kind: "observation",
        label: "tool returned observation",
        sensitivity: "internal",
        confidence: "medium",
        scope: "run",
        intendedUsage: ["audit"],
        sourceRefs: [{ type: "message", id: "message-0" }]
      }]
    }
  };
}

function stateItem(kind: string, label: string, messageId: string) {
  return {
    kind,
    label,
    sensitivity: "internal",
    confidence: "high",
    scope: "run",
    intendedUsage: ["compaction-continuity"],
    sourceRefs: [{ type: "message", id: messageId }]
  };
}
