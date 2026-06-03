import { describe, expect, it } from "vitest";
import { AgentEventType, type ArtifactStore, type ReadArtifactResult } from "@guga-agent/core";
import { artifactReferenceFixture, durableEvent, projectionFixture } from "./test-fixtures";
import { buildAuditView } from "./audit-view";

describe("audit replay view", () => {
  it("explains artifact-backed tool results, lifecycle decisions, compaction, usage, errors and memory absence", async () => {
    const artifact = artifactReferenceFixture();
    const events = [
      durableEvent({
        type: AgentEventType.PermissionResolved,
        runId: "run-1",
        turn: 0,
        request: {
          toolCallId: "call-1",
          action: "execute",
          subject: { kind: "tool", toolName: "search" }
        },
        decision: { type: "allow", source: "policy" }
      }, { eventId: "event-1" }),
      durableEvent({
        type: AgentEventType.HookDecision,
        runId: "run-1",
        phase: "tool.call.before",
        pluginId: "policy",
        hookId: "gate",
        call: { id: "call-1", name: "search", input: {} },
        decision: { effect: "allow" }
      }, { eventId: "event-2" }),
      durableEvent({
        type: AgentEventType.ToolResultBudgeted,
        runId: "run-1",
        turn: 0,
        correlation: { runId: "run-1", turn: 0, toolCallId: "call-1", attempt: 0 },
        call: { id: "call-1", name: "search", input: {} },
        result: {
          ok: true,
          content: "preview",
          budget: {
            applied: true,
            originalContentChars: 1000,
            reference: { type: "artifact", id: artifact.artifactId, artifact },
            view: { llmPreview: "preview" }
          }
        }
      }, { eventId: "event-3", artifactRefs: [artifact] }),
      durableEvent({
        type: AgentEventType.ContextCompactCompleted,
        runId: "run-1",
        turn: 0,
        projectionId: "projection-1",
        result: compactResult()
      }, { eventId: "event-4" }),
      durableEvent({
        type: AgentEventType.UsageRecorded,
        runId: "run-1",
        turn: 0,
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 }
      }, { eventId: "event-5" }),
      durableEvent({
        type: AgentEventType.ModelEvent,
        runId: "run-1",
        turn: 0,
        event: {
          type: "model.provider_error",
          error: { code: "RATE_LIMIT", message: "rate limited", category: "rate-limit" }
        }
      }, { eventId: "event-6" })
    ];

    const view = await buildAuditView({
      events,
      artifactStore: artifactStore({ ok: true, data: "full output", reference: artifact })
    });

    expect(view.timeline.map((item) => item.eventType)).toEqual([
      AgentEventType.PermissionResolved,
      AgentEventType.HookDecision,
      AgentEventType.ToolResultBudgeted,
      AgentEventType.ContextCompactCompleted,
      AgentEventType.UsageRecorded,
      AgentEventType.ModelEvent
    ]);
    expect(view.timeline[2]).toMatchObject({
      artifactRefs: [expect.objectContaining({ artifactId: artifact.artifactId })],
      diagnostics: [expect.objectContaining({ code: "TOOL_RESULT_ARTIFACT_REFERENCED" })]
    });
    expect(view.timeline[3]).toMatchObject({
      diagnostics: [expect.objectContaining({ code: "CONTEXT_COMPACTION_BOUNDARY" })]
    });
    expect(view.diagnostics).toContainEqual(expect.objectContaining({ code: "CURATED_MEMORY_WRITE_ABSENT" }));
  });

  it("surfaces missing artifacts, corrupt tails and interrupted operations as diagnostics", async () => {
    const artifact = artifactReferenceFixture();
    const view = await buildAuditView({
      events: [
        durableEvent({ type: AgentEventType.RunStarted, runId: "run-open", input: "hello" }, { eventId: "event-1" }),
        durableEvent({
          type: AgentEventType.ToolResultBudgeted,
          runId: "run-open",
          turn: 0,
          correlation: { runId: "run-open", turn: 0, toolCallId: "call-1", attempt: 0 },
          call: { id: "call-1", name: "search", input: {} },
          result: {
            ok: true,
            content: "preview",
            budget: { applied: true, reference: { type: "artifact", id: artifact.artifactId, artifact } }
          }
        }, { eventId: "event-2", artifactRefs: [artifact] })
      ],
      artifactStore: artifactStore({
        ok: false,
        status: "not_found",
        diagnostic: { kind: "artifact_missing", message: "missing", recoverable: true }
      }),
      readDiagnostics: [{ kind: "partial_tail", message: "partial final line", recoverable: true }]
    });

    expect(view.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ARTIFACT_NOT_FOUND" }),
      expect.objectContaining({ code: "STORE_PARTIAL_TAIL" }),
      expect.objectContaining({ code: "RUN_INTERRUPTED" })
    ]));
  });

  it("reports curated memory writes if they appear in the durable path", async () => {
    const view = await buildAuditView({
      events: [
        durableEvent({
          type: AgentEventType.ToolResult,
          runId: "run-1",
          turn: 0,
          call: { id: "call-1", name: "write_file", input: { path: "MEMORY.md" } },
          result: { ok: true, content: "wrote memory" }
        }, { eventId: "event-memory" })
      ]
    });

    expect(view.diagnostics).toContainEqual(expect.objectContaining({
      code: "CURATED_MEMORY_WRITE_DETECTED",
      severity: "error",
      eventId: "event-memory"
    }));
  });

  it("surfaces Attention OS source summaries and compaction continuity without treating candidates as curated memory", async () => {
    const projection = projectionFixture({ attentionSources: true });
    const view = await buildAuditView({
      events: [
        durableEvent({
          type: AgentEventType.ContextProjectionCreated,
          runId: "run-1",
          turn: 0,
          projection
        }, { eventId: "event-projection" }),
        durableEvent({
          type: AgentEventType.ContextCompactCompleted,
          runId: "run-1",
          turn: 0,
          projectionId: "projection-1",
          result: compactResult()
        }, { eventId: "event-compact" })
      ]
    });

    expect(view.timeline[0]).toMatchObject({
      diagnostics: [expect.objectContaining({
        code: "ATTENTION_CONTEXT_SOURCES_RECORDED",
        metadata: expect.objectContaining({
          summaries: expect.arrayContaining([
            expect.objectContaining({ sourceId: "source-state", ontology: "state_projection" }),
            expect.objectContaining({ sourceId: "source-memory-candidate", candidateCount: 1 })
          ])
        })
      })]
    });
    expect(view.timeline[1]).toMatchObject({
      diagnostics: [expect.objectContaining({
        code: "CONTEXT_COMPACTION_BOUNDARY",
        metadata: expect.objectContaining({
          quality: expect.objectContaining({ continuitySourceIds: ["source-state", "source-trace"] })
        })
      })]
    });
    expect(view.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MEMORY_CANDIDATE_CONTEXT_RECORDED" }),
      expect.objectContaining({ code: "CURATED_MEMORY_WRITE_ABSENT" })
    ]));
    expect(view.diagnostics).not.toContainEqual(expect.objectContaining({ code: "CURATED_MEMORY_WRITE_DETECTED" }));
  });
});

function artifactStore(result: ReadArtifactResult): ArtifactStore {
  return {
    putArtifact() {
      return { ok: false, status: "unavailable", reason: "not used" };
    },
    readArtifact() {
      return result;
    },
    tombstoneArtifact() {
      return {
        ok: false,
        status: "unavailable",
        diagnostic: { kind: "unknown", message: "not used", recoverable: true }
      };
    }
  };
}

function compactResult() {
  return {
    id: "compaction-1",
    trigger: "manual" as const,
    summary: {
      objective: "test",
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
      retainedSourceIds: ["source-history"],
      compactedSourceIds: ["source-old"]
    },
    preTokenEstimate: 1000,
    postTokenEstimate: 200,
    iterationNo: 1,
    preprocessingApplied: { dedup: true, smartCollapse: false, parameterTruncation: false },
    strippedRoundIds: [],
    degradedTo: "local-skeleton" as const,
    quality: {
      status: "degraded" as const,
      summarySource: "local-skeleton" as const,
      retainedSourceCount: 2,
      compactedSourceCount: 1,
      continuitySourceIds: ["source-state", "source-trace"],
      signals: ["local-skeleton-summary"]
    }
  };
}
