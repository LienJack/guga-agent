import { describe, expect, it } from "vitest";
import type { HostEvent } from "@guga-agent/host-protocol";
import { reduceHostEvent, reduceHostEvents, reduceWorkbenchAction } from "./event-reducer";
import { createInitialWorkbenchState } from "./state";
import { createWorkbenchViewModel } from "./views";

describe("workbench event reducer", () => {
  it("merges message deltas into one assistant block and marks it completed", () => {
    const state = reduceHostEvents(initialState(), [
      event({
        type: "run.started",
        input: "hello"
      }),
      event({
        type: "message.delta",
        seq: 2,
        messageId: "message-1",
        role: "assistant",
        text: "hello "
      }),
      event({
        type: "message.delta",
        seq: 3,
        messageId: "message-1",
        role: "assistant",
        text: "world"
      }),
      event({
        type: "message.completed",
        seq: 4,
        messageId: "message-1",
        role: "assistant"
      })
    ]);

    expect(state.transcriptBlocks).toHaveLength(1);
    expect(state.transcriptBlocks[0]).toMatchObject({
      kind: "assistant",
      messageId: "message-1",
      text: "hello world",
      status: "completed",
      firstSeq: 2,
      lastSeq: 4
    });
  });

  it("adds a final assistant block when completion has only finalAnswer", () => {
    const state = reduceHostEvents(initialState(), [
      event({
        type: "run.started",
        input: "summarize"
      }),
      event({
        type: "run.completed",
        seq: 2,
        finalAnswer: "done"
      })
    ]);

    expect(state.runStatus).toBe("completed");
    expect(state.transcriptBlocks).toEqual([
      expect.objectContaining({
        kind: "assistant",
        messageId: "final:run-1",
        text: "done",
        status: "completed"
      })
    ]);
  });

  it("keeps tool lifecycle in one scannable transcript block", () => {
    const state = reduceHostEvents(initialState(), [
      event({
        type: "tool.started",
        callId: "call-1",
        name: "shell",
        input: { command: "pwd" }
      }),
      event({
        type: "tool.progress",
        seq: 2,
        callId: "call-1",
        name: "shell",
        message: "running",
        progress: 0.5
      }),
      event({
        type: "tool.completed",
        seq: 3,
        callId: "call-1",
        name: "shell",
        output: "/repo",
        artifactIds: ["artifact-1"]
      })
    ]);

    expect(state.transcriptBlocks).toHaveLength(1);
    expect(state.transcriptBlocks[0]).toMatchObject({
      kind: "tool",
      callId: "call-1",
      name: "shell",
      status: "completed",
      output: "/repo",
      progress: 0.5,
      progressMessage: "running",
      artifactIds: ["artifact-1"],
      firstSeq: 1,
      lastSeq: 3
    });
  });

  it("tracks retry events as transcript status", () => {
    const state = reduceHostEvents(initialState(), [
      event({
        type: "retry.started",
        attempt: 2,
        reason: "rate limited"
      }),
      event({
        type: "retry.completed",
        seq: 2,
        attempt: 2
      })
    ]);

    expect(state.transcriptBlocks[0]).toMatchObject({
      kind: "retry",
      attempt: 2,
      status: "completed",
      reason: "rate limited"
    });
    expect(createWorkbenchViewModel(state).transcript[0]).toMatchObject({
      title: "Retry completed: attempt 2"
    });
  });

  it("updates permission request status when it resolves", () => {
    const state = reduceHostEvents(initialState(), [
      event({
        type: "permission.requested",
        requestId: "permission-1",
        callId: "call-1",
        toolName: "filesystem.write",
        reason: "Write file"
      }),
      event({
        type: "permission.resolved",
        seq: 2,
        requestId: "permission-1",
        callId: "call-1",
        decision: "allow",
        remember: "session"
      })
    ]);

    expect(state.runStatus).toBe("running");
    expect(state.transcriptBlocks).toHaveLength(1);
    expect(state.transcriptBlocks[0]).toMatchObject({
      kind: "permission",
      status: "allowed",
      remember: "session",
      lastSeq: 2
    });
  });

  it("tracks interaction prompt lifecycle", () => {
    const state = reduceHostEvents(initialState(), [
      event({
        type: "interaction.requested",
        requestId: "interaction-1",
        request: { kind: "confirm", message: "Continue?" }
      }),
      event({
        type: "interaction.resolved",
        seq: 2,
        requestId: "interaction-1",
        response: true
      })
    ]);

    expect(state.transcriptBlocks[0]).toMatchObject({
      kind: "interaction",
      status: "resolved",
      response: true
    });
    expect(createWorkbenchViewModel(state).transcript[0]).toMatchObject({
      title: "Interaction resolved: confirm",
      detail: "true"
    });
  });

  it("projects queue counts and previews", () => {
    const state = reduceHostEvent(initialState(), event({
      type: "queue.updated",
      pending: [
        {
          id: "input-1",
          mode: "follow_up",
          status: "pending",
          textPreview: "next question",
          createdAt: "2026-05-28T00:00:00.000Z"
        },
        {
          id: "input-2",
          mode: "steer",
          status: "deferred",
          textPreview: "revise plan",
          createdAt: "2026-05-28T00:00:01.000Z"
        }
      ]
    }));

    expect(state.queue).toMatchObject({
      followUpCount: 1,
      steerCount: 1
    });
    expect(createWorkbenchViewModel(state).statusBar.queueLabel).toBe("queue 2 pending (1 follow-up, 1 steer)");
    expect(createWorkbenchViewModel(state).transcript[0]?.detail).toContain("follow_up: next question");
  });

  it("sets failed status and error transcript for run failures", () => {
    const state = reduceHostEvent(initialState(), event({
      type: "run.failed",
      error: { code: "PROVIDER_FAILED", message: "Provider failed" }
    }));

    expect(state.runStatus).toBe("failed");
    expect(createWorkbenchViewModel(state).statusBar.text).toBe("Failed: Provider failed");
    expect(state.transcriptBlocks[0]).toMatchObject({
      kind: "error",
      error: { code: "PROVIDER_FAILED" }
    });
  });

  it("maps cancelled run failure into abort state and transcript", () => {
    const state = reduceHostEvent(initialState(), event({
      type: "run.failed",
      error: { code: "RUN_CANCELLED", message: "Run was cancelled" }
    }));

    expect(state.runStatus).toBe("cancelled");
    expect(createWorkbenchViewModel(state).statusBar.text).toBe("Aborted");
    expect(createWorkbenchViewModel(state).transcript[0]).toMatchObject({
      kind: "abort",
      title: "Run aborted",
      detail: "Run was cancelled"
    });
  });

  it("maps explicit cancellation events into abort state", () => {
    const state = reduceHostEvent(initialState(), event({
      type: "run.cancelled",
      reason: "User aborted"
    }));

    expect(state.runStatus).toBe("cancelled");
    expect(createWorkbenchViewModel(state).transcript[0]).toMatchObject({
      kind: "abort",
      title: "Run aborted",
      detail: "User aborted"
    });
  });

  it("marks pending permissions and interactions cancelled", () => {
    const state = reduceHostEvents(initialState(), [
      event({
        type: "permission.requested",
        requestId: "permission-1",
        callId: "call-1",
        toolName: "shell"
      }),
      event({
        type: "permission.cancelled",
        seq: 2,
        requestId: "permission-1",
        callId: "call-1",
        toolName: "shell",
        reason: "Run was cancelled"
      }),
      event({
        type: "interaction.requested",
        seq: 3,
        requestId: "interaction-1",
        request: { kind: "confirm", message: "Continue?" }
      }),
      event({
        type: "interaction.cancelled",
        seq: 4,
        requestId: "interaction-1",
        reason: "Run was cancelled"
      })
    ]);

    expect(state.transcriptBlocks).toEqual([
      expect.objectContaining({ kind: "permission", status: "cancelled" }),
      expect.objectContaining({ kind: "interaction", status: "cancelled" })
    ]);
  });

  it("keeps /clear UI-only by hiding old blocks without losing run state", () => {
    const beforeClear = reduceHostEvents(initialState(), [
      event({
        type: "run.started",
        input: "hello"
      }),
      event({
        type: "message.delta",
        seq: 2,
        messageId: "message-1",
        role: "assistant",
        text: "hello"
      })
    ]);

    const cleared = reduceWorkbenchAction(beforeClear, { type: "ui.clear" });
    const afterClear = reduceHostEvent(cleared, event({
      type: "tool.started",
      seq: 3,
      callId: "call-1",
      name: "shell"
    }));

    expect(cleared.transcriptBlocks).toHaveLength(1);
    expect(createWorkbenchViewModel(cleared).transcript).toEqual([]);
    expect(cleared.activeRunId).toBe("run-1");
    expect(cleared.runStatus).toBe("running");
    expect(createWorkbenchViewModel(afterClear).transcript).toEqual([
      expect.objectContaining({
        kind: "tool",
        name: "shell"
      })
    ]);
  });
});

function initialState() {
  return createInitialWorkbenchState({
    projectPath: "/repo",
    profileId: "code",
    modelId: "mock-model",
    configSource: "test",
    slashCommands: ["/clear", "/status"]
  });
}

function event<Event extends HostEvent>(input: Omit<Event, "seq" | "occurredAt" | "sessionId" | "runId"> & {
  seq?: number;
  occurredAt?: string;
  sessionId?: string;
  runId?: string;
}): Event {
  return {
    seq: 1,
    occurredAt: "2026-05-28T00:00:00.000Z",
    sessionId: "session-1",
    runId: "run-1",
    ...input
  } as Event;
}
