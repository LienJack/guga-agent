import { afterEach, describe, expect, it } from "vitest";
import { createAgentRuntime, createMockProvider, createTestTool } from "@guga-agent/core";
import { HostRuntime } from "@guga-agent/host-runtime";
import { HostClientError, connectHost } from "./client";
import { createLocalGugaHost, type LocalGugaHost } from "./server-launcher";
import { parseSsePayload } from "./sse-client";

const hosts: LocalGugaHost[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()));
});

describe("host SDK", () => {
  it("creates sessions, starts runs, parses event streams, and reads final state", async () => {
    const host = await startSdkHost();
    const client = connectHost({ baseUrl: host.baseUrl });

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

  it("parses buffered SSE payloads", () => {
    expect(parseSsePayload([
      "id: run-1:1",
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
