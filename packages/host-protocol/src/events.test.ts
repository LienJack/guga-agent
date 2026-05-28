import { describe, expect, it } from "vitest";
import {
  createHostEventSequencer,
  createSseEnvelope,
  encodeSseEnvelope,
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
    const failed = sequencer.next({
      type: "run.failed",
      sessionId: "session-1",
      runId: "run-1",
      error: { code: "FAILED", message: "nope" }
    });

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
      id: "run-1:1",
      event: HOST_EVENT_SSE_NAME,
      data: event
    });
    expect(encodeSseEnvelope(envelope)).toBe([
      "id: run-1:1",
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
        textPreview: "revise plan",
        createdAt: "2026-05-27T00:00:00.000Z"
      }]
    });

    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    expect(JSON.stringify(event)).not.toContain("\"text\":");
  });
});
