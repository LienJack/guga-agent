import { AgentEventType, ModelEventType, type AgentEvent } from "@guga-agent/core";
import { describe, expect, it } from "vitest";
import { createProjectionContext, projectAgentEvent } from "./event-projector";

describe("host event projector", () => {
  it("projects model reasoning deltas for workbench transcript display", () => {
    const context = createProjectionContext({
      sessionId: "session-1",
      runId: "run-1",
      now: () => new Date("2026-05-28T00:00:00.000Z")
    });
    const event: AgentEvent = {
      type: AgentEventType.ModelEvent,
      runId: "run-1",
      turn: 2,
      event: {
        type: ModelEventType.ReasoningDelta,
        delta: "checking tools"
      }
    };

    expect(projectAgentEvent(event, context)).toEqual([
      expect.objectContaining({
        type: "message.reasoning_delta",
        seq: 1,
        sessionId: "session-1",
        runId: "run-1",
        messageId: "reasoning-run-1-2",
        text: "checking tools"
      })
    ]);
  });
});
