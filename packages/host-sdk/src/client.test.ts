import { afterEach, describe, expect, it } from "vitest";
import { createAgentRuntime, createMockProvider, createTestTool, type ToolDefinition } from "@guga-agent/core";
import { HostRuntime } from "@guga-agent/host-runtime";
import { HostClientError, connectHost } from "./client";
import { expectProtocolDiscoveryContract, expectQueueAndAbortContract } from "./contract/host-client-contract";
import { createLocalGugaHost, type LocalGugaHost } from "./server-launcher";
import { parseSsePayload } from "./sse-client";

const hosts: LocalGugaHost[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()));
});

describe("host SDK", () => {
  it("reads and verifies host protocol discovery", async () => {
    const host = await startSdkHost();

    await expect(host.client.getProtocolInfo()).resolves.toMatchObject({
      version: "1",
      features: expect.arrayContaining(["permissions", "run-abort"])
    });
    await expect(host.client.assertCompatibleProtocol()).resolves.toMatchObject({ version: "1" });
    await expect(connectHost({
      baseUrl: "http://incompatible",
      fetch: async () => new Response(JSON.stringify({ version: "2", features: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    }).assertCompatibleProtocol()).rejects.toMatchObject({
      code: "UNSUPPORTED_PROTOCOL_VERSION",
      status: 426
    });
  });

  it("creates sessions, starts runs, parses event streams, and reads final state", async () => {
    const host = await startSdkHost();
    const client = connectHost({ baseUrl: host.baseUrl, bridgeToken: host.server.bridgeToken });

    const session = await client.createSession({ title: "SDK" });
    const run = await client.startRun(session.id, { input: "hello", providerId: "mock" });
    expect(run).toMatchObject({ status: "running" });

    const events: string[] = [];
    for await (const event of client.streamRunEvents(run.id)) {
      events.push(event.type);
    }

    expect(events).toEqual([
      "run.started",
      "message.delta",
      "message.completed",
      "usage.recorded",
      "run.completed"
    ]);
    await expect(client.getRun(run.id)).resolves.toMatchObject({
      status: "completed",
      finalAnswer: "hello from sdk"
    });
  });

  it("covers JSON event listing, cancel, capabilities, and typed errors", async () => {
    const host = await startSdkHost();
    const session = await host.client.createSession();
    const run = await host.client.startRun(session.id, { input: "hello", providerId: "mock" });
    await drainRunEvents(host, run.id);

    await expect(host.client.listRunEvents(run.id)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "run.started" }),
      expect.objectContaining({ type: "run.completed" })
    ]));
    await expect(host.client.cancelRun(run.id)).resolves.toMatchObject({ status: "completed" });
    await expect(host.client.listCapabilities()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool", name: "echo" })
    ]));
    await expect(host.client.getMetricsSnapshot()).resolves.toMatchObject({
      counters: expect.objectContaining({
        "runs.completed": 1,
        "usage.total_tokens": 11
      })
    });
    await expect(host.client.listAuditSummaries()).resolves.toEqual([
      expect.objectContaining({
        runId: run.id,
        usage: expect.objectContaining({ totalTokens: 11 })
      })
    ]);
    await expect(host.client.getOperationalStatus()).resolves.toMatchObject({
      platform: {
        surfaces: expect.arrayContaining([
          expect.objectContaining({ kind: "tool", status: "available" }),
          expect.objectContaining({ kind: "compact", status: "unavailable" })
        ]),
        memory: expect.objectContaining({ state: "unavailable" }),
        agents: expect.objectContaining({ state: "unavailable" }),
        compact: expect.objectContaining({
          state: "unavailable",
          reason: "Host compaction control is not implemented yet"
        })
      },
      metrics: expect.objectContaining({
        counters: expect.objectContaining({ "runs.completed": 1 })
      })
    });
    await expect(host.client.getRun("missing")).rejects.toBeInstanceOf(HostClientError);
  });

  it("sends queued run input through the typed client", async () => {
    const host = await startControlledSdkHost();
    const session = await host.client.createSession();
    const run = await host.client.startRun(session.id, { input: "wait", providerId: "controlled" });

    await expect(host.client.sendRunInput(run.id, {
      mode: "steer",
      text: "use the shorter path"
    })).resolves.toMatchObject({
      queuedInputs: [
        expect.objectContaining({
          mode: "steer",
          textPreview: "use the shorter path"
        })
      ]
    });
    await expect(host.client.abortRun(run.id)).resolves.toMatchObject({ status: "cancelled" });
  });

  it("runs the initial shared host client protocol contract", async () => {
    const host = await startControlledSdkHost(["session-1", "run-1", "input-1"]);

    await expectProtocolDiscoveryContract({
      client: host.client,
      createRunningRun: async () => ({ runId: "unused" })
    });
    await expectQueueAndAbortContract({
      client: host.client,
      createRunningRun: async () => {
        const session = await host.client.createSession();
        const run = await host.client.startRun(session.id, { input: "wait", providerId: "controlled" });
        return { runId: run.id };
      }
    });
  });

  it("manages sessions, branches, and interactions through the typed client", async () => {
    const host = await startControlledSdkHost(["session-1", "branch-1", "run-1", "interaction-1"]);
    const session = await host.client.createSession({ title: "SDK tree" });

    await expect(host.client.listSessions()).resolves.toEqual([
      expect.objectContaining({ id: session.id, title: "SDK tree" })
    ]);
    await expect(host.client.forkSession(session.id, { summary: "alternate" })).resolves.toMatchObject({
      activeBranchId: "branch-branch-1"
    });
    await expect(host.client.getSessionTree(session.id)).resolves.toMatchObject({
      activeBranchId: "branch-branch-1",
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "main" }),
        expect.objectContaining({ id: "branch-branch-1", summary: "alternate" })
      ])
    });
    await expect(host.client.resumeSession(session.id, { branchId: "main" })).resolves.toMatchObject({
      activeBranchId: "main"
    });

    const run = await host.client.startRun(session.id, { input: "wait", providerId: "controlled" });
    const interaction = await host.client.requestInteraction(session.id, {
      runId: run.id,
      request: { kind: "input", title: "Name" }
    });
    await expect(host.client.getInteraction(interaction.id)).resolves.toMatchObject({
      status: "pending",
      request: { kind: "input", title: "Name" }
    });
    await expect(host.client.respondInteraction(interaction.id, "Guga")).resolves.toMatchObject({
      status: "resolved",
      response: "Guga"
    });
    await host.client.abortRun(run.id);
  });

  it("reads code task resources and verification attempts through the typed client", async () => {
    const host = await startSdkHost();
    const session = await host.client.createSession();
    const run = await host.client.startRun(session.id, { input: "implement", providerId: "mock" });
    await drainRunEvents(host, run.id);

    host.server.hostRuntime.recordHostEvent(run.id, {
      type: "task.created",
      sessionId: session.id,
      taskId: "task-1",
      rootRunId: run.id,
      cwd: "/repo",
      objective: "implement feature",
      state: "created"
    });
    host.server.hostRuntime.recordHostEvent(run.id, {
      type: "verification.completed",
      sessionId: session.id,
      taskId: "task-1",
      runId: run.id,
      attempt: {
        id: "verify-1",
        taskId: "task-1",
        sessionId: session.id,
        runId: run.id,
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "passed",
        reason: "focused test",
        exitCode: 0,
        outputSummary: "ok"
      }
    });

    await expect(host.client.listSessionTasks(session.id)).resolves.toEqual([
      expect.objectContaining({ id: "task-1", objective: "implement feature" })
    ]);
    await expect(host.client.getTask("task-1")).resolves.toMatchObject({
      id: "task-1",
      verificationAttempts: [expect.objectContaining({ id: "verify-1", status: "passed" })]
    });
    await expect(host.client.listTaskVerificationAttempts("task-1")).resolves.toEqual([
      expect.objectContaining({ id: "verify-1", command: "pnpm test" })
    ]);
  });

  it("responds to permission resources through the typed client", async () => {
    const host = await startPermissionSdkHost();
    const session = await host.client.createSession();
    const run = await host.client.startRun(session.id, { input: "write", providerId: "mock" });
    const permissionId = `${run.id}:write:1`;
    await waitFor(async () => {
      const permission = await host.client.getPermission(permissionId).catch(() => undefined);
      return permission?.status === "pending";
    });

    await expect(host.client.respondPermission(permissionId, {
      decision: "maybe" as "allow"
    })).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST"
    });
    await expect(host.client.respondPermission(permissionId, {
      decision: "allow",
      remember: "once"
    })).resolves.toMatchObject({
      id: permissionId,
      status: "allowed"
    });
    await expect(host.client.respondPermission(permissionId, {
      decision: "deny"
    })).rejects.toMatchObject({
      status: 409,
      code: "PERMISSION_NOT_PENDING"
    });
    await expect(host.client.respondPermission("missing", {
      decision: "allow"
    })).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND"
    });
  });


  it("parses buffered SSE payloads", () => {
    expect(parseSsePayload([
      "id: 1",
      "event: guga.host-event",
      "data: {\"type\":\"run.started\",\"seq\":1,\"occurredAt\":\"now\",\"sessionId\":\"s\",\"runId\":\"run-1\",\"input\":\"hi\"}",
      "",
      ""
    ].join("\n")).map((envelope) => envelope.data.type)).toEqual(["run.started"]);
  });
});

async function startSdkHost(): Promise<LocalGugaHost> {
  const runtime = createAgentRuntime();
  runtime.registerProvider(createMockProvider([
    { type: "final", content: "hello from sdk", usage: { totalTokens: 11 } }
  ]));
  runtime.registerTool(createTestTool({ name: "echo", content: "ok" }));
  const host = await createLocalGugaHost({
    hostRuntime: new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1", "session-2", "run-2"])
    }),
    pollIntervalMs: 1
  });
  hosts.push(host);
  return host;
}

async function startControlledSdkHost(ids: string[] = ["session-1", "run-1", "input-1"]): Promise<LocalGugaHost> {
  const runtime = createAgentRuntime();
  runtime.registerProvider({
    id: "controlled",
    async generate(request) {
      const content = await new Promise<string>((resolve) => {
        request.signal?.addEventListener("abort", () => resolve("aborted"), { once: true });
      });
      return { type: "final", content };
    }
  });
  const host = await createLocalGugaHost({
    hostRuntime: new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(ids)
    }),
    pollIntervalMs: 1
  });
  hosts.push(host);
  return host;
}

async function startPermissionSdkHost(): Promise<LocalGugaHost> {
  const host = await createLocalGugaHost({
    runtimeOptions: { permissions: { profile: "ask-on-write" } },
    pollIntervalMs: 1
  });
  host.server.hostRuntime.registerProvider(createMockProvider([
    { type: "tool_calls", toolCalls: [{ id: "write", name: "write_tool", input: { value: "x" } }] },
    { type: "final", content: "done" }
  ]));
  host.server.hostRuntime.registerTool(writeTool());
  hosts.push(host);
  return host;
}

async function drainRunEvents(host: LocalGugaHost, runId: string): Promise<void> {
  let eventCount = 0;
  for await (const event of host.client.streamRunEvents(runId)) {
    eventCount += event.type.length > 0 ? 1 : 0;
  }
  expect(eventCount).toBeGreaterThan(0);
}

function deterministicIds(values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (!value) {
      throw new Error("No deterministic id left");
    }
    return value;
  };
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for condition");
}

function writeTool(): ToolDefinition {
  return {
    name: "write_tool",
    description: "Write test tool",
    inputSchema: { type: "object" },
    effect: "write",
    execute() {
      return { ok: true, content: "write ok" };
    }
  };
}
