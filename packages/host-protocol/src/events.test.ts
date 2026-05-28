import { describe, expect, it } from "vitest";
import {
  createHostEventSequencer,
  createSseEnvelope,
  encodeSseEnvelope,
  HOST_PROTOCOL_FEATURES,
  HOST_PROTOCOL_VERSION,
  HOST_EVENT_SSE_NAME,
  isTerminalHostEvent
} from "./index";

describe("host protocol events", () => {
  it("assigns monotonic sequence numbers and timestamps", () => {
    const sequencer = createHostEventSequencer({
      now: () => new Date("2026-05-27T00:00:00.000Z")
    });

    const started = sequencer.next({
      type: "run.started",
      sessionId: "session-1",
      runId: "run-1",
      input: "hello"
    });
    const completed = sequencer.next({
      type: "run.completed",
      sessionId: "session-1",
      runId: "run-1",
      finalAnswer: "done"
    });

    expect(started).toMatchObject({ seq: 1, occurredAt: "2026-05-27T00:00:00.000Z" });
    expect(completed).toMatchObject({ seq: 2, occurredAt: "2026-05-27T00:00:00.000Z" });
    expect(sequencer.currentSeq()).toBe(2);
    expect(JSON.parse(JSON.stringify(started))).toEqual(started);
  });

  it("identifies terminal run events", () => {
    const sequencer = createHostEventSequencer();
    const cancelled = sequencer.next({
      type: "run.cancelled",
      sessionId: "session-1",
      runId: "run-1",
      reason: "user abort"
    });
    const failed = sequencer.next({
      type: "run.failed",
      sessionId: "session-1",
      runId: "run-1",
      error: { code: "FAILED", message: "nope" }
    });

    expect(isTerminalHostEvent(cancelled)).toBe(true);
    expect(isTerminalHostEvent(failed)).toBe(true);
  });

  it("encodes host events as SSE envelopes", () => {
    const event = createHostEventSequencer({
      now: () => new Date("2026-05-27T00:00:00.000Z")
    }).next({
      type: "message.delta",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "message-1",
      role: "assistant",
      text: "hi"
    });

    const envelope = createSseEnvelope(event);

    expect(envelope).toEqual({
      id: "1",
      event: HOST_EVENT_SSE_NAME,
      data: event
    });
    expect(encodeSseEnvelope(envelope)).toBe([
      "id: 1",
      `event: ${HOST_EVENT_SSE_NAME}`,
      `data: ${JSON.stringify(event)}`,
      "",
      ""
    ].join("\n"));
  });

  it("serializes queue updates without queued input bodies", () => {
    const event = createHostEventSequencer({
      now: () => new Date("2026-05-27T00:00:00.000Z")
    }).next({
      type: "queue.updated",
      sessionId: "session-1",
      runId: "run-1",
      pending: [{
        id: "input-1",
        mode: "steer",
        status: "deferred",
        textPreview: "revise plan",
        createdAt: "2026-05-27T00:00:00.000Z"
      }]
    });

    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    expect(JSON.stringify(event)).not.toContain("\"text\":");
  });

  it("serializes generic interaction request and response events", () => {
    const sequencer = createHostEventSequencer({
      now: () => new Date("2026-05-27T00:00:00.000Z")
    });
    const requested = sequencer.next({
      type: "interaction.requested",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "interaction-1",
      request: { kind: "confirm", message: "Continue?" }
    });
    const resolved = sequencer.next({
      type: "interaction.resolved",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "interaction-1",
      response: true
    });

    expect(requested).toMatchObject({ type: "interaction.requested", request: { kind: "confirm" } });
    expect(resolved).toMatchObject({ type: "interaction.resolved", response: true });
  });

  it("serializes tool progress and retry events", () => {
    const sequencer = createHostEventSequencer({
      now: () => new Date("2026-05-27T00:00:00.000Z")
    });
    const progress = sequencer.next({
      type: "tool.progress",
      sessionId: "session-1",
      runId: "run-1",
      callId: "call-1",
      name: "shell",
      message: "running tests",
      progress: 0.5
    });
    const retry = sequencer.next({
      type: "retry.started",
      sessionId: "session-1",
      runId: "run-1",
      attempt: 2,
      reason: "rate limited"
    });

    expect(JSON.parse(JSON.stringify(progress))).toEqual(progress);
    expect(retry).toMatchObject({ type: "retry.started", attempt: 2 });
  });

  it("serializes reasoning deltas for workbench display", () => {
    const event = createHostEventSequencer({
      now: () => new Date("2026-05-27T00:00:00.000Z")
    }).next({
      type: "message.reasoning_delta",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "reasoning-1",
      text: "checking available tools"
    });

    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    expect(event).toMatchObject({
      type: "message.reasoning_delta",
      messageId: "reasoning-1",
      text: "checking available tools"
    });
  });

  it("exposes protocol discovery constants", () => {
    expect(HOST_PROTOCOL_VERSION).toBe("1");
    expect(HOST_PROTOCOL_FEATURES).toEqual(expect.arrayContaining([
      "run-input-queue",
      "tool-progress",
      "retry-events",
      "follow-up-consumption",
      "permissions"
    ]));
  });
});
