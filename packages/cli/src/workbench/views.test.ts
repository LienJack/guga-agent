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
    expect(view.welcome).toMatchObject({
      visible: true,
      title: "Welcome to Guga",
      modelLabel: "guga-mock",
      contextLabel: "context unknown",
      costLabel: "cost unknown",
      cwdLabel: "/workspace/app"
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
    expect(createWorkbenchViewModel(state).welcome.visible).toBe(false);

    const cleared = reduceWorkbenchAction(state, { type: "ui.clear" });
    const view = createWorkbenchViewModel(cleared);
    expect(view.transcript).toEqual([]);
    expect(view.welcome.visible).toBe(false);
  });

  it("projects code task plan progress for renderer-neutral status panels", () => {
    const state = reduceHostEvent(createInitialWorkbenchState({
      projectPath: "/workspace/app",
      profileId: "code",
      slashCommands: []
    }), {
      type: "task.created",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      taskId: "task-1",
      rootRunId: "run-1",
      cwd: "/workspace/app",
      objective: "add TUI task progress",
      state: "executing",
      plan: {
        summary: "add task progress",
        files: [{ path: "src/task-progress.tsx", action: "create", reason: "status panel" }],
        checks: [{ command: "pnpm test", cwd: "/workspace/app", required: true, reason: "view coverage" }],
        assumptions: [],
        risks: ["terminal width"],
        ledgerItems: [
          {
            id: "task-panel",
            title: "Render task panel",
            status: "done",
            evidence: [{
              kind: "diff",
              id: "diff-1",
              summary: "panel added"
            }],
            changedFiles: ["src/task-progress.tsx"],
            verificationAttemptIds: ["verify-1"],
            risks: []
          },
          {
            id: "test-panel",
            title: "Test task panel",
            status: "evidence-submitted",
            evidence: [],
            changedFiles: [],
            verificationAttemptIds: [],
            risks: []
          }
        ]
      }
    });
    const view = createWorkbenchViewModel(state);

    expect(view.taskProgress).toMatchObject({
      title: "Task executing",
      objective: "add TUI task progress",
      phaseLabel: "phase executing attempt 0",
      progressLabel: "1/2 settled",
      currentItemLabel: "current test-panel",
      completionLabel: "1 required verification before completion",
      items: [
        expect.objectContaining({
          id: "task-panel",
          detail: expect.stringContaining("evidence panel added")
        }),
        expect.objectContaining({
          id: "test-panel",
          isCurrent: true
        })
      ]
    });
  });

  it("projects platform status panels from typed host resources", () => {
    const state = reduceWorkbenchAction(createInitialWorkbenchState({
      projectPath: "/workspace/app",
      profileId: "code",
      slashCommands: []
    }), {
      type: "platform.panel",
      statusText: "providers=1 tools=1 operations=1 runs=0 tokens=12",
      panel: {
        kind: "status",
        command: "/status",
        title: "Operational status",
        summary: "providers=1 tools=1 operations=1 runs=0 tokens=12",
        status: {
          updatedAt: "2026-05-28T00:00:00.000Z",
          capabilities: [
            { type: "tool", name: "fs_write", source: "plugin", status: "registered" },
            { type: "operation", name: "provider.health", source: "plugin", status: "registered" }
          ],
          platform: {
            surfaces: [
              { kind: "tool", name: "Tools", status: "available", source: "runtime", actions: ["inspect"], capabilityNames: ["fs_write"] },
              { kind: "compact", name: "Compaction", status: "unavailable", source: "host", actions: ["inspect"], reason: "Host compaction control is not implemented yet" }
            ],
            memory: {
              state: "unavailable",
              source: "host",
              reason: "No memory capabilities are registered",
              capabilityNames: [],
              policy: { autoInject: false, autoWrite: false }
            },
            agents: {
              state: "unavailable",
              source: "host",
              reason: "No delegation capabilities are registered",
              capabilityNames: [],
              coordinatorReady: false
            },
            compact: {
              state: "unavailable",
              source: "host",
              reason: "Host compaction control is not implemented yet",
              allowedActions: []
            }
          },
          health: [{ providerId: "mock", status: "healthy", checkedAt: "2026-05-28T00:00:00.000Z", diagnostics: [] }],
          audit: [],
          metrics: { updatedAt: "2026-05-28T00:00:00.000Z", counters: { "usage.total_tokens": 12 } },
          diagnostics: []
        }
      }
    });
    const view = createWorkbenchViewModel(state);

    expect(view.statusBar.text).toBe("providers=1 tools=1 operations=1 runs=0 tokens=12");
    expect(view.platformPanel).toMatchObject({
      title: "Operational status",
      subtitle: "providers=1 tools=1 operations=1 runs=0 tokens=12",
      rows: expect.arrayContaining([
        expect.objectContaining({
          label: "Tools",
          value: "available runtime",
          detail: expect.stringContaining("capabilities fs_write")
        }),
        expect.objectContaining({
          label: "Compaction",
          value: "unavailable host",
          tone: "warning",
          detail: expect.stringContaining("Host compaction control is not implemented yet")
        })
      ])
    });

    const cleared = reduceWorkbenchAction(state, { type: "ui.clear" });
    expect(createWorkbenchViewModel(cleared).platformPanel).toBeUndefined();
  });
});
