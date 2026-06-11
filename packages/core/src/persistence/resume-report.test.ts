import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority, type ProjectionLedgerEntry } from "../contracts/context";
import type { ResumeReport } from "./resume-report";

describe("ResumeReport", () => {
  it("can carry Attention OS projection ledger summaries without raw source metadata", () => {
    const ledgerEntry: ProjectionLedgerEntry = {
      id: "ledger-projection-1",
      runId: "run-1",
      turn: 0,
      projectionId: "projection-1",
      sourceRefs: [{ type: "message", id: "message-0" }],
      sourceDescriptors: [{
        id: "memory-candidate",
        kind: ContextSourceKind.MemoryCandidate,
        priority: ContextSourcePriority.Low,
        provenance: { origin: "core" },
        tokenEstimate: { status: "estimated", tokens: 1 },
        modelVisible: false
      }],
      sourceMetadataSummaries: [{
        sourceId: "memory-candidate",
        kind: ContextSourceKind.MemoryCandidate,
        ontology: ContextSourceKind.MemoryCandidate,
        sensitivity: "sensitive",
        confidence: "medium",
        scope: "session",
        intendedUsage: ["audit", "memory-review"],
        candidateCount: 1
      }],
      policyDecisions: []
    };
    const report: ResumeReport = {
      ok: true,
      session: { id: "session-1", createdAt: "2026-06-03T00:00:00.000Z", updatedAt: "2026-06-03T00:00:00.000Z", activeBranchId: "main" },
      branches: [{
        id: "main",
        sessionId: "session-1",
        createdAt: "2026-06-03T00:00:00.000Z",
        createdFrom: { type: "root" },
        visibleEventIds: ["event-1"]
      }],
      activeLeaf: {
        sessionId: "session-1",
        branchId: "main",
        eventId: "event-1",
        updatedAt: "2026-06-03T00:00:00.000Z",
        reason: "resume-selected"
      },
      conversation: [{ role: "user", content: "hello" }],
      projectionLedger: [ledgerEntry],
      interrupted: [],
      recoveryOutcomes: [],
      diagnostics: []
    };

    expect(report.projectionLedger[0]?.sourceMetadataSummaries).toEqual([
      expect.objectContaining({ ontology: "memory_candidate", candidateCount: 1 })
    ]);
    expect(JSON.stringify(report)).not.toContain("raw candidate text");
  });
});
