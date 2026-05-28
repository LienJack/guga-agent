import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import type { AgentEvent } from "../contracts/events";
import type { DurableEventEnvelope } from "../contracts/persistence";
import { createDurableEventEnvelope } from "./durable-event-envelope";
import { detectInterruptedOperations, interruptionTerminalStatuses } from "./interruption-detector";

describe("detectInterruptedOperations", () => {
  it("classifies a run.started without run.finished as interrupted", () => {
    const interrupted = detectInterruptedOperations([
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-open", input: "hello" }, { eventId: "event-run-open" })
    ]);

    expect(interrupted).toEqual([
      expect.objectContaining({
        kind: "run",
        status: "interrupted",
        runId: "run-open",
        eventId: "event-run-open",
        allowedActions: expect.arrayContaining(["resume", "fork", "mark_abandoned"])
      })
    ]);
  });

  it("does not classify completed model, tool, permission and compaction operations as interrupted", () => {
    const call = { id: "call-1", name: "echo", input: {} };
    const request = {
      runId: "run-1",
      turn: 0,
      toolCallId: "call-1",
      attempt: 1,
      call,
      subject: { toolName: "echo", effect: "read" as const },
      profile: "default" as const
    };
    const interrupted = detectInterruptedOperations([
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" }, { eventId: "event-run-start" }),
      durableEvent({
        type: AgentEventType.ModelRequested,
        runId: "run-1",
        turn: 0,
        providerId: "mock",
        messages: [{ role: "user", content: "hello" }],
        toolNames: ["echo"]
      }, { eventId: "event-model-start", turn: 0 }),
      durableEvent({ type: AgentEventType.ModelResponded, runId: "run-1", turn: 0, response: { type: "tool_calls", toolCalls: [call] } }, { eventId: "event-model-done", turn: 0 }),
      durableEvent({ type: AgentEventType.ToolStarted, runId: "run-1", turn: 0, correlation: { runId: "run-1", turn: 0, callId: "call-1", index: 0 }, call }, { eventId: "event-tool-start", turn: 0 }),
      durableEvent({ type: AgentEventType.ToolCompleted, runId: "run-1", turn: 0, correlation: { runId: "run-1", turn: 0, callId: "call-1", index: 0 }, call, result: { ok: true, content: "ok" } }, { eventId: "event-tool-done", turn: 0 }),
      durableEvent({ type: AgentEventType.PermissionRequested, runId: "run-1", turn: 0, request }, { eventId: "event-permission-start", turn: 0 }),
      durableEvent({ type: AgentEventType.PermissionResolved, runId: "run-1", turn: 0, request, decision: { action: "allow", remember: "once", source: "profile" } }, { eventId: "event-permission-done", turn: 0 }),
      durableEvent({ type: AgentEventType.ContextCompactStarted, runId: "run-1", turn: 0, projectionId: "projection-1", trigger: "manual" }, { eventId: "event-compact-start", turn: 0 }),
      durableEvent({ type: AgentEventType.ContextCompactCompleted, runId: "run-1", turn: 0, projectionId: "projection-1", result: compactResult() }, { eventId: "event-compact-done", turn: 0 }),
      durableEvent({ type: AgentEventType.RunFinished, runId: "run-1", status: "completed" }, { eventId: "event-run-done" })
    ]);

    expect(interrupted).toEqual([]);
  });

  it("understands durable-only turn and hook lifecycle markers before U8 publishes typed events", () => {
    const interrupted = detectInterruptedOperations([
      durableEvent({ type: "turn.started" }, { eventId: "event-turn", eventType: "turn.started", runId: "run-1", turn: 1 }),
      durableEvent({ type: "hook.started", phase: "pre_tool_gate", pluginId: "plugin-1", hookId: "hook-1" }, { eventId: "event-hook", eventType: "hook.started", runId: "run-1", turn: 1 })
    ]);

    expect(interrupted.map((operation) => operation.kind)).toEqual(["turn", "hook"]);
  });

  it("exposes terminal status vocabulary for resume diagnostics", () => {
    expect(interruptionTerminalStatuses("tool")).toEqual(expect.arrayContaining(["completed", "failed", "cancelled", "timeout", "denied"]));
  });
});

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
    boundary: { id: "boundary-1", retainedSourceIds: [], compactedSourceIds: [] },
    preTokenEstimate: 10,
    postTokenEstimate: 5,
    iterationNo: 1,
    preprocessingApplied: { dedup: false, smartCollapse: false, parameterTruncation: false },
    strippedRoundIds: [],
    degradedTo: "local-skeleton" as const
  };
}

function durableEvent(payload: AgentEvent | Record<string, unknown>, options: {
  eventId: string;
  eventType?: string;
  runId?: string;
  turn?: number;
}): DurableEventEnvelope {
  const runId = options.runId ?? (typeof payload.runId === "string" ? payload.runId : undefined);
  const turn = options.turn ?? (typeof payload.turn === "number" ? payload.turn : undefined);
  return createDurableEventEnvelope({
    schemaVersion: 1,
    eventId: options.eventId,
    ...(options.eventType ? { eventType: options.eventType } : {}),
    streamId: "session/session-1",
    streamRevision: 0,
    sessionId: "session-1",
    branchId: "main",
    ...(runId ? { runId } : {}),
    ...(turn !== undefined ? { turn } : {}),
    parentEventId: null,
    previousEventHash: null,
    createdAt: "2026-05-27T00:00:00.000Z",
    actor: { type: "runtime", id: "test" },
    source: { type: "runtime", id: "core-test" },
    payload
  });
}
