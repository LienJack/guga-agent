import { describe, expect, it } from "vitest";
import { reduceHostEvent, reduceWorkbenchAction } from "./event-reducer";
import { createInitialWorkbenchState } from "./state";
import { createWorkbenchViewModel } from "./views";

describe("workbench views", () => {
  it("projects startup metadata without renderer types", () => {
    const view = createWorkbenchViewModel(createInitialWorkbenchState({
      projectPath: "/workspace/app",
      sessionId: "session-1",
      branchId: "branch-1",
      profileId: "code",
      providerId: "mock",
      modelId: "guga-mock",
      configSource: "project .guga/config.json",
      slashCommands: ["/new", "/status", "/clear", "/exit"]
    }));

    expect(view.startup).toEqual({
      projectPath: "/workspace/app",
      sessionLabel: "session session-1",
      profileLabel: "code",
      modelLabel: "guga-mock",
      configSourceLabel: "project .guga/config.json",
      slashCommands: ["/new", "/status", "/clear", "/exit"]
    });
    expect(view.statusBar).toMatchObject({
      runStatus: "idle",
      text: "Idle",
      sessionId: "session-1",
      queueLabel: "queue empty",
      usageLabel: "tokens 0 in 0 out 0",
      inputLocked: false
    });
    expect(view.connection).toEqual({
      status: "connected",
      inputLocked: false
    });
  });

  it("projects active run and disconnected input lock facts", () => {
    const running = reduceHostEvent(createInitialWorkbenchState({
      projectPath: "/workspace/app",
      profileId: "code",
      slashCommands: []
    }), {
      type: "run.started",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      input: "hello"
    });
    const state = reduceWorkbenchAction(running, {
      type: "stream.seq_discontinuity",
      expectedSeq: 2,
      actualSeq: 5
    });
    const view = createWorkbenchViewModel(state);

    expect(view.activeRun).toEqual({
      sessionId: "session-1",
      runId: "run-1",
      status: "running",
      text: "Disconnected: Host event sequence jumped from 1 to 5."
    });
    expect(view.connection).toMatchObject({
      status: "disconnected",
      reason: "seq-discontinuity",
      expectedSeq: 2,
      actualSeq: 5,
      inputLocked: true
    });
    expect(view.statusBar).toMatchObject({
      inputLocked: true,
      disconnectedReason: "seq-discontinuity"
    });
  });

  it("renders failed tool terminal details visibly", () => {
    const state = reduceHostEvent(createInitialWorkbenchState({
      projectPath: "/workspace/app",
      profileId: "code",
      slashCommands: []
    }), {
      type: "tool.failed",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      callId: "call-1",
      name: "shell",
      error: {
        code: "TOOL_DENIED",
        message: "Permission denied"
      }
    });

    expect(createWorkbenchViewModel(state).transcript[0]).toMatchObject({
      title: "Tool failed: shell",
      detail: "Permission denied"
    });
  });
});
