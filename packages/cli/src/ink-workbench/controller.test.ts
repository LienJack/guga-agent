import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostClient } from "@guga-agent/host-sdk";
import { WorkbenchController } from "./controller";

describe("workbench controller", () => {
  it("starts runs from idle prompt submissions and reduces streamed events", async () => {
    const client = fakeClient({
      streamEvents: [{
        type: "run.completed",
        seq: 1,
        occurredAt: "2026-05-28T00:00:00.000Z",
        sessionId: "session-1",
        runId: "run-1",
        finalAnswer: "done"
      }]
    });
    const controller = controllerFor(client);

    await expect(controller.submitText("hello")).resolves.toMatchObject({ ok: true });
    await tick();

    expect(client.startRun).toHaveBeenCalledWith("session-1", {
      input: "hello",
      providerId: "mock",
      modelId: "mock-model"
    });
    expect(controller.state.runStatus).toBe("completed");
    expect(controller.state.transcriptBlocks).toEqual([
      expect.objectContaining({ kind: "assistant", text: "done" })
    ]);
  });

  it("routes active run input, permission responses, and interactions through explicit host actions", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    controller.applyEvent({
      type: "run.started",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      input: "hello"
    });

    await controller.submitText("steer now");
    expect(client.sendRunInput).toHaveBeenCalledWith("run-1", { mode: "steer", text: "steer now" });

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
    await controller.submitText("allow");
    expect(client.respondPermission).toHaveBeenCalledWith("permission-1", { decision: "allow", remember: "once" });
    controller.applyEvent({
      type: "permission.resolved",
      seq: 3,
      occurredAt: "2026-05-28T00:00:01.500Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "permission-1",
      callId: "call-1",
      decision: "allow"
    });

    controller.applyEvent({
      type: "interaction.requested",
      seq: 4,
      occurredAt: "2026-05-28T00:00:02.000Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "interaction-1",
      request: { kind: "confirm", message: "Continue?" }
    });
    await controller.submitText("true");
    expect(client.respondInteraction).toHaveBeenCalledWith("interaction-1", true);
  });

  it("fails closed for unknown permission responses", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
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

    await expect(controller.submitText("maybe")).resolves.toEqual({
      ok: false,
      error: "Permission response must be allow or deny."
    });
    expect(client.respondPermission).not.toHaveBeenCalled();
    expect(controller.state.pendingPermission).toMatchObject({
      requestId: "permission-1",
      toolName: "shell"
    });
  });

  it("locks host-writing submissions while disconnected but allows reload after the replay seq", async () => {
    const replayEvents = [
      {
        type: "run.started" as const,
        seq: 1,
        occurredAt: "2026-05-28T00:00:00.000Z",
        sessionId: "session-1",
        runId: "run-1",
        input: "hello"
      },
      {
        type: "message.delta" as const,
        seq: 2,
        occurredAt: "2026-05-28T00:00:01.000Z",
        sessionId: "session-1",
        runId: "run-1",
        messageId: "message-1",
        role: "assistant" as const,
        text: "safe replay"
      },
      {
        type: "queue.updated" as const,
        seq: 3,
        occurredAt: "2026-05-28T00:00:02.000Z",
        sessionId: "session-1",
        runId: "run-1",
        pending: []
      }
    ];
    const client = fakeClient({
      replayEvents,
      streamEvents: [{
        type: "run.completed",
        seq: 4,
        occurredAt: "2026-05-28T00:00:03.000Z",
        sessionId: "session-1",
        runId: "run-1",
        finalAnswer: "done"
      }]
    });
    const controller = controllerFor(client);
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

    await expect(controller.submitText("do not send")).resolves.toMatchObject({ ok: false });
    expect(client.sendRunInput).not.toHaveBeenCalled();

    await expect(controller.submitText("/reload")).resolves.toMatchObject({ ok: true });
    await tick();
    expect(client.listRunEvents).toHaveBeenCalledWith("run-1");
    expect(client.streamRunEvents).toHaveBeenLastCalledWith("run-1", expect.objectContaining({ afterSeq: 3 }));
    expect(controller.state.disconnected).toBeUndefined();
    expect(controller.state.continuity).toMatchObject({
      status: "stream-reconnected",
      title: "Reloaded host events",
      detail: "Replayed through seq 3",
      retainedFacts: expect.arrayContaining(["last seq 3"])
    });
    expect(controller.state.transcriptBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user", text: "hello" }),
      expect.objectContaining({ kind: "assistant", text: "safe replay" })
    ]));

    await expect(controller.submitText("next")).resolves.toMatchObject({ ok: true });
    expect(client.startRun).toHaveBeenCalledWith("session-1", {
      input: "next",
      providerId: "mock",
      modelId: "mock-model"
    });
  });

  it("uses the selected model for future prompt runs", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);

    await expect(controller.executeSlash("/model slow")).resolves.toMatchObject({
      ok: true,
      message: "model switched to slow"
    });
    await expect(controller.startPromptRun("after switch")).resolves.toMatchObject({ ok: true });

    expect(client.startRun).toHaveBeenCalledWith("session-1", {
      input: "after switch",
      providerId: "mock-alt",
      modelId: "slow-model"
    });
  });

  it("ignores blank prompt submissions before they reach the host", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);

    await expect(controller.startPromptRun("   ")).resolves.toEqual({ ok: true });

    expect(client.startRun).not.toHaveBeenCalled();
  });

  it("returns host start-run errors instead of throwing out of the workbench", async () => {
    const client = fakeClient();
    vi.mocked(client.startRun).mockRejectedValueOnce(new Error("Run input is required"));
    const controller = controllerFor(client);

    await expect(controller.startPromptRun("hello")).resolves.toEqual({
      ok: false,
      error: "Run input is required"
    });
  });

  it("ignores blank active-run input before it reaches the host", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
    controller.applyEvent({
      type: "run.started",
      seq: 1,
      occurredAt: "2026-05-28T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      input: "hello"
    });

    await expect(controller.submitRunInput("steer", "  ")).resolves.toEqual({ ok: true });

    expect(client.sendRunInput).not.toHaveBeenCalled();
  });

  it("opens a provider selector for login commands", async () => {
    const controller = controllerFor(fakeClient());

    await expect(controller.selectorForCommand("/login")).resolves.toMatchObject({
      source: "provider",
      title: "Login provider",
      options: [
        expect.objectContaining({
          id: "copilot",
          commandText: "/login copilot"
        }),
        expect.objectContaining({
          id: "codex",
          commandText: "/login codex"
        })
      ]
    });
  });

  it("passes OAuth runner into login slash commands", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-controller-home-"));
    const controller = controllerFor(fakeClient(), {
      env: { GUGA_HOME: gugaHome },
      oauthLoginRunner: async ({ providerId, store }) => ({
        ok: true,
        credential: store.saveCredential({
          providerId,
          kind: "oauth",
          accessToken: "controller-oauth-token",
          tokenType: "bearer"
        })
      })
    });

    await expect(controller.submitText("/login codex")).resolves.toMatchObject({
      ok: true,
      message: "logged in provider codex"
    });
  });

  it("surfaces actionable Codex OAuth guidance from the default runner path", async () => {
    const controller = controllerFor(fakeClient(), {
      oauthLoginRunner: async () => ({
        ok: false,
        error: {
          code: "codex_oauth_contract_pending",
          message: [
            "Codex OAuth is not enabled by default yet.",
            "guga login openai --api-key-env OPENAI_API_KEY",
            "Codex app-server account/login/start adapter"
          ].join("\n")
        }
      })
    });

    await expect(controller.submitText("/login codex")).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("guga login openai --api-key-env OPENAI_API_KEY")
    });
  });

  it("prioritizes pending permission responses over slash commands", async () => {
    const client = fakeClient();
    const controller = controllerFor(client);
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

    await expect(controller.submitText("/model slow")).resolves.toMatchObject({
      ok: false,
      error: "Permission response must be allow or deny."
    });
    expect(client.respondPermission).not.toHaveBeenCalled();
    expect(controller.modelId).toBe("mock-model");
  });
});

function controllerFor(
  client: HostClient,
  options: Pick<ConstructorParameters<typeof WorkbenchController>[0], "env" | "oauthLoginRunner"> = {}
) {
  return new WorkbenchController({
    client,
    config: {
      defaultModel: "mock-model",
      models: [
        { id: "mock-model", providerId: "mock", modelId: "mock-model" },
        { id: "slow", providerId: "mock-alt", modelId: "slow-model" }
      ]
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
      updatedAt: "2026-05-28T00:00:00.000Z",
      activeBranchId: "main"
    },
    providerId: "mock",
    modelId: "mock-model",
    profileId: "code",
    ...options
  });
}

function fakeClient(options: {
  readonly streamEvents?: readonly Awaited<ReturnType<HostClient["listRunEvents"]>>[number][];
  readonly replayEvents?: readonly Awaited<ReturnType<HostClient["listRunEvents"]>>[number][];
} = {}): HostClient {
  return {
    getProtocolInfo: vi.fn(),
    assertCompatibleProtocol: vi.fn(),
    createSession: vi.fn(),
    listSessions: vi.fn(async () => []),
    getSession: vi.fn(),
    resumeSession: vi.fn(),
    forkSession: vi.fn(),
    getSessionTree: vi.fn(),
    startRun: vi.fn(async () => ({
      id: "run-1",
      sessionId: "session-1",
      status: "running",
      input: "hello",
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      lastSeq: 0
    })),
    getRun: vi.fn(),
    listRunEvents: vi.fn(async () => options.replayEvents ?? options.streamEvents ?? []),
    streamRunEvents: vi.fn(async function* (_runId: string, streamOptions?: { afterSeq?: number }) {
      for (const event of options.streamEvents ?? []) {
        if (streamOptions?.afterSeq === undefined || event.seq > streamOptions.afterSeq) {
          yield event;
        }
      }
    }),
    sendRunInput: vi.fn(async () => runResource()),
    cancelRun: vi.fn(async () => runResource()),
    abortRun: vi.fn(async () => runResource()),
    requestInteraction: vi.fn(),
    getInteraction: vi.fn(),
    respondInteraction: vi.fn(async () => ({
      id: "interaction-1",
      sessionId: "session-1",
      status: "resolved",
      request: { kind: "confirm", message: "Continue?" },
      response: true,
      createdAt: "2026-05-28T00:00:00.000Z"
    })),
    getPermission: vi.fn(),
    respondPermission: vi.fn(async () => ({
      id: "permission-1",
      runId: "run-1",
      sessionId: "session-1",
      callId: "call-1",
      toolName: "shell",
      status: "allowed",
      createdAt: "2026-05-28T00:00:00.000Z"
    })),
    listCapabilities: vi.fn(async () => []),
    listProviderHealth: vi.fn(async () => []),
    listAuditSummaries: vi.fn(async () => []),
    getMetricsSnapshot: vi.fn(),
    getOperationalStatus: vi.fn()
  };
}

function runResource() {
  return {
    id: "run-1",
    sessionId: "session-1",
    status: "running" as const,
    input: "hello",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    lastSeq: 1
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
