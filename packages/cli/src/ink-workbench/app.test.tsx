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
    expect(lastFrame()).toContain("session session-1");
    expect(lastFrame()).toContain("idle | Idle");
    expect(lastFrame()).toContain("No transcript yet.");
    expect(lastFrame()).toContain("prompt");
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
      toolName: "shell"
    });
    await tick();

    expect(lastFrame()).toContain("Permission: type allow or deny");
    expect(lastFrame()).toContain("waiting-for-permission");
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
    getOperationalStatus: vi.fn()
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
