import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "ink-testing-library";
import type { HostClient } from "@guga-agent/host-sdk";
import { InkWorkbenchApp } from "./app";
import { WorkbenchController } from "./controller";

afterEach(() => {
  cleanup();
});

describe("Ink workbench app", () => {
  it("renders startup metadata, idle status, transcript, and bottom editor", () => {
    const { lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

    expect(lastFrame()).toContain("Guga Ink workbench");
    expect(lastFrame()).toContain("Welcome to Guga");
    expect(lastFrame()).toContain("Tips");
    expect(lastFrame()).toContain("context unknown");
    expect(lastFrame()).toContain("cost unknown");
    expect(lastFrame()).toContain("session session-1");
    expect(lastFrame()).toContain("idle | Idle");
    expect(lastFrame()).toContain("No transcript yet.");
    expect(lastFrame()).toContain("prompt");
  });

  it("keeps a compact no-color welcome fallback without hiding the editor", () => {
    const previousNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    try {
      const { lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

      expect(lastFrame()).toContain("Welcome to Guga");
      expect(lastFrame()).toContain("Use Tab to complete slash commands.");
      expect(lastFrame()).toContain("prompt");
    } finally {
      if (previousNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = previousNoColor;
      }
    }
  });

  it("echoes prompt text in the bottom editor before submission", async () => {
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

    stdin.write("hello");
    await tick();

    expect(lastFrame()).toContain("hello");
  });

  it("opens the slash palette before submitting slash-prefixed text", async () => {
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

    stdin.write("/");
    await tick();
    stdin.write("model");
    await tick();

    expect(lastFrame()).toContain("Slash commands /model");
    expect(lastFrame()).toContain("/model");
  });

  it("completes the highlighted slash command into the editor with Tab", async () => {
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

    stdin.write("/mod");
    await tick();
    stdin.write("\t");
    await tick();

    expect(lastFrame()).toContain("/model");
    expect(lastFrame()).not.toContain("Slash commands");
  });

  it("submits a Tab-completed selector slash command with one Enter", async () => {
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

    stdin.write("/log");
    await tick();
    stdin.write("\t");
    await tick();

    expect(lastFrame()).toContain("/login");
    expect(lastFrame()).not.toContain("Slash commands");

    stdin.write("\r");
    await tick();

    expect(lastFrame()).toContain("Login provider");
    expect(lastFrame()).not.toContain("Slash commands");
  });

  it("submits arguments added after Tab completion without reopening the slash palette", async () => {
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

    stdin.write("/log");
    await tick();
    stdin.write("\t");
    await tick();
    stdin.write("openai");
    await tick();
    stdin.write("\r");
    await tick();

    expect(lastFrame()).toContain("login target: openai");
    expect(lastFrame()).not.toContain("Slash commands");
  });

  it("submits slash commands with arguments from the prompt buffer", async () => {
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controllerFor(fakeClient())} />);

    stdin.write("/login openai");
    await tick();
    stdin.write("\r");
    await tick();

    expect(lastFrame()).toContain("login target: openai");
  });

  it("renders pending permission controls from controller state", async () => {
    const controller = controllerFor(fakeClient());
    const { lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    controller.applyEvent({
      type: "permission.requested",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "permission-1",
      callId: "call-1",
      toolName: "shell",
      input: { command: "rm -rf tmp" },
      reason: "Delete generated files"
    });
    await tick();

    expect(lastFrame()).toContain("Permission pending: shell");
    expect(lastFrame()).toContain("Risk: high risk");
    expect(lastFrame()).toContain("run run-1 | call call-1 | once");
    expect(lastFrame()).toContain("type allow or deny; unknown input is denied");
    expect(lastFrame()).toContain("waiting-for-permission");
  });

  it("renders code task progress from controller state", async () => {
    const controller = controllerFor(fakeClient());
    const { lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    controller.applyEvent({
      type: "task.created",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      taskId: "task-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      state: "executing",
      plan: {
        summary: "implement feature",
        files: [{ path: "src/feature.ts", action: "modify", reason: "feature code" }],
        checks: [{ command: "pnpm test", cwd: "/repo", required: true, reason: "focused test" }],
        assumptions: [],
        risks: [],
        ledgerItems: [
          {
            id: "item-1",
            title: "Edit feature",
            status: "done",
            evidence: [],
            changedFiles: ["src/feature.ts"],
            verificationAttemptIds: [],
            risks: []
          },
          {
            id: "item-2",
            title: "Run tests",
            status: "in-progress",
            evidence: [],
            changedFiles: [],
            verificationAttemptIds: [],
            risks: []
          }
        ]
      }
    });
    controller.applyEvent({
      type: "verification.started",
      seq: 2,
      occurredAt: "2026-05-28T00:00:01.000Z",
      sessionId: "session-1",
      runId: "run-1",
      taskId: "task-1",
      attempt: {
        id: "verify-1",
        taskId: "task-1",
        sessionId: "session-1",
        runId: "run-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "running",
        reason: "focused test"
      }
    });
    await tick();

    expect(lastFrame()).toContain("Task executing | 1/2 settled");
    expect(lastFrame()).toContain("implement feature");
    expect(lastFrame()).toContain("current item-2");
    expect(lastFrame()).toContain("verify running: pnpm test");
    expect(lastFrame()).toContain("item-2 in-progress - Run tests");
  });

  it("renders platform status panels from slash inspection commands", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    const { lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    await controller.executeSlash("/status");
    await tick();

    expect(client.getOperationalStatus).toHaveBeenCalled();
    expect(lastFrame()).toContain("Operational status | providers=1 tools=1 operations=1 runs=0 tokens=12");
    expect(lastFrame()).toContain("Tools: available runtime");
    expect(lastFrame()).toContain("capabilities fs_write");
    expect(lastFrame()).toContain("Compaction: unavailable host");
    expect(lastFrame()).toContain("Host compaction control is not implemented yet");
  });

  it("renders context continuity after compaction events", async () => {
    const controller = controllerFor(fakeClient());
    const { lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    controller.applyEvent({
      type: "context.compacted",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      boundaryId: "compact-1",
      trigger: "auto",
      summary: {
        objective: "ship platform TUI",
        nextSteps: ["run CLI tests"]
      }
    });
    await tick();

    expect(lastFrame()).toContain("Context compacted");
    expect(lastFrame()).toContain("auto at compact-1");
    expect(lastFrame()).toContain("objective ship platform TUI");
    expect(lastFrame()).toContain("next run CLI tests");
  });

  it("routes pending permission input before an open slash palette", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    stdin.write("/");
    await tick();
    expect(lastFrame()).toContain("Slash commands");

    controller.applyEvent({
      type: "permission.requested",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "permission-1",
      callId: "call-1",
      toolName: "shell"
    });
    await tick();
    stdin.write("allow");
    await tick();
    stdin.write("\r");
    await tick();

    expect(client.respondPermission).toHaveBeenCalledWith("permission-1", { decision: "allow", remember: "once" });
    expect(client.abortRun).not.toHaveBeenCalled();
  });

  it("restores the previous prompt draft after a permission overlay resolves", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    stdin.write("draft");
    await tick();
    expect(lastFrame()).toContain("draft");

    controller.applyEvent({
      type: "permission.requested",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "permission-1",
      callId: "call-1",
      toolName: "shell"
    });
    await tick();
    stdin.write("allow");
    await tick();
    stdin.write("\r");
    await tick();
    controller.applyEvent({
      type: "permission.resolved",
      seq: 2,
      occurredAt: "2026-05-28T00:00:01.000Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "permission-1",
      decision: "allow"
    });
    await tick();

    expect(client.respondPermission).toHaveBeenCalledWith("permission-1", { decision: "allow", remember: "once" });
    expect(lastFrame()).toContain("draft");
    expect(lastFrame()).toContain("run:steer");
  });

  it("keeps the editor draft when disconnected input is locked", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    controller.applyEvent({
      type: "run.started",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      input: "hello"
    });
    controller.applyEvent({
      type: "message.delta",
      seq: 3,
      occurredAt: "2026-05-28T00:00:01.000Z",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "message-1",
      role: "assistant",
      text: "missed seq"
    });
    await tick();

    stdin.write("draft");
    await tick();
    stdin.write("\r");
    await tick();

    expect(client.sendRunInput).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("draft");
    expect(lastFrame()).toContain("Input is locked while the host stream is disconnected.");
  });

  it("does not abort the active run when Escape is captured by pending permission", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    controller.applyEvent({
      type: "run.started",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      input: "hello"
    });
    controller.applyEvent({
      type: "permission.requested",
      seq: 2,
      occurredAt: "2026-05-28T00:00:01.000Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "permission-1",
      callId: "call-1",
      toolName: "shell"
    });
    await tick();
    stdin.write("\u001B");
    await tick();

    expect(client.abortRun).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("permission-response");
  });

  it("exits terminal mode on Ctrl+C without aborting the active run", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    const { stdin, lastFrame } = render(<InkWorkbenchApp controller={controller} />);

    controller.applyEvent({
      type: "run.started",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      input: "hello"
    });
    await tick();

    stdin.write("\u0003");
    await tick();
    stdin.write("still here");
    await tick();

    expect(client.abortRun).not.toHaveBeenCalled();
    expect(lastFrame()).not.toContain("still here");
  });
});

function controllerFor(client: HostClient) {
  return new WorkbenchController({
    client,
    config: {
      defaultModel: "mock-model",
      models: [{ id: "mock-model", modelId: "mock-model" }]
    },
    startup: {
      projectPath: "/repo",
      sessionId: "session-1",
      profileId: "code",
      providerId: "mock",
      modelId: "mock-model",
      configSource: "test",
      slashCommands: ["/model", "/profile", "/resume", "/exit"]
    },
    session: {
      id: "session-1",
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z"
    },
    providerId: "mock",
    modelId: "mock-model",
    profileId: "code"
  });
}

function fakeClient(): HostClient {
  return {
    getProtocolInfo: vi.fn(),
    assertCompatibleProtocol: vi.fn(),
    createSession: vi.fn(),
    listSessions: vi.fn(async () => []),
    getSession: vi.fn(),
    resumeSession: vi.fn(),
    forkSession: vi.fn(),
    getSessionTree: vi.fn(),
    startRun: vi.fn(),
    getRun: vi.fn(),
    listRunEvents: vi.fn(async () => []),
    streamRunEvents: vi.fn(async function* () {}),
    sendRunInput: vi.fn(),
    cancelRun: vi.fn(),
    abortRun: vi.fn(),
    requestInteraction: vi.fn(),
    getInteraction: vi.fn(),
    respondInteraction: vi.fn(),
    getPermission: vi.fn(),
    respondPermission: vi.fn(),
    listCapabilities: vi.fn(async () => []),
    listProviderHealth: vi.fn(async () => []),
    listAuditSummaries: vi.fn(async () => []),
    getMetricsSnapshot: vi.fn(),
    getOperationalStatus: vi.fn(async () => operationalStatus())
  };
}

function operationalStatus() {
  return {
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
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
