import { describe, expect, it } from "vitest";
import type { CompactionResult } from "../contracts/context";
import { compactedRetryPolicyDecisions } from "./compacted-projection";

describe("compactedRetryPolicyDecisions", () => {
  it("records only the retry reinjection decision for a compacted projection", () => {
    const decisions = compactedRetryPolicyDecisions(compactionResultFixture());

    expect(decisions).toEqual([{
      id: "compact-1-retry",
      kind: "reinjection",
      phase: "context.reinject",
      sourceIds: ["compaction_summary"],
      reason: "retry projection includes compacted summary and omits compacted sources",
      metadata: {
        boundaryId: "boundary-1",
        compactedSourceIds: ["history-1", "history-2"]
      }
    }]);
  });
});

function compactionResultFixture(): CompactionResult {
  return {
    id: "compact-1",
    trigger: "provider-overflow",
    summary: {
      objective: "finish context attention work",
      completedWork: [],
      currentBlockers: [],
      nextSteps: [],
      keyFilesAndSymbols: [],
      toolResultReferences: [],
      unresolvedQuestions: [],
      userConstraints: []
    },
    boundary: {
      id: "boundary-1",
      retainedSourceIds: ["pending-turn"],
      compactedSourceIds: ["history-1", "history-2"]
    },
    preTokenEstimate: 120,
    postTokenEstimate: 60,
    iterationNo: 1,
    preprocessingApplied: {
      dedup: true,
      smartCollapse: true,
      parameterTruncation: true
    },
    strippedRoundIds: [],
    degradedTo: "none"
  };
}
