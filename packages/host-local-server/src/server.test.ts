import { afterEach, describe, expect, it } from "vitest";
import { createAgentRuntime, createMockProvider, createTestTool } from "@guga-agent/core";
import { HostRuntime } from "@guga-agent/host-runtime";
import { HostLocalServer } from "./server";

const servers: HostLocalServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("HostLocalServer", () => {
  it("creates sessions, starts runs, streams SSE events, and reads final run state", async () => {
    const server = await startTestServer();

    const session = await postJson<{ id: string }>(`${server.url}/sessions`, { title: "HTTP test" });
    const run = await postJson<{ id: string; status: string; finalAnswer?: string }>(
      `${server.url}/sessions/${session.id}/runs`,
      { input: "hello", providerId: "mock" }
    );

    expect(run).toMatchObject({ status: "running" });

    const eventResponse = await fetch(`${server.url}/runs/${run.id}/events`, {
      headers: { accept: "text/event-stream" }
    });
    const eventTypes = parseSseEventTypes(await eventResponse.text());
    expect(eventTypes).toEqual([
      "run.started",
      "message.delta",
      "message.completed",
      "usage.recorded",
      "run.completed"
    ]);

    await expect(fetchJson(`${server.url}/runs/${run.id}`)).resolves.toMatchObject({
      id: run.id,
      status: "completed",
      finalAnswer: "hello from server"
    });
  });

  it("keeps run events after an SSE consumer disconnects", async () => {
    const server = await startTestServer();
    const session = await postJson<{ id: string }>(`${server.url}/sessions`, {});
    const run = await postJson<{ id: string }>(`${server.url}/sessions/${session.id}/runs`, {
      input: "use tool",
      providerId: "mock"
    });

    const eventResponse = await fetch(`${server.url}/runs/${run.id}/events`, {
      headers: { accept: "text/event-stream" }
    });
    const reader = eventResponse.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await drainRunEvents(server.url, run.id);

    await expect(fetchJson(`${server.url}/runs/${run.id}/events`)).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ type: "run.started" }),
        expect.objectContaining({ type: "run.completed" })
      ])
    });
  });

  it("lists capabilities and exposes cancel as a run state transition", async () => {
    const server = await startTestServer();
    const session = await postJson<{ id: string }>(`${server.url}/sessions`, {});
    const run = await postJson<{ id: string }>(`${server.url}/sessions/${session.id}/runs`, {
      input: "hello",
      providerId: "mock"
    });
    await drainRunEvents(server.url, run.id);

    await expect(fetchJson(`${server.url}/capabilities`)).resolves.toMatchObject({
      capabilities: expect.arrayContaining([
        expect.objectContaining({ type: "tool", name: "echo" })
      ])
    });
    await expect(fetchJson(`${server.url}/operations/metrics`)).resolves.toMatchObject({
      counters: expect.objectContaining({
        "runs.started": 1,
        "runs.completed": 1,
        "usage.total_tokens": 9
      })
    });
    await expect(fetchJson(`${server.url}/operations/audit`)).resolves.toMatchObject({
      summaries: [
        expect.objectContaining({
          runId: run.id,
          usage: expect.objectContaining({ totalTokens: 9 })
        })
      ]
    });
    await expect(fetchJson(`${server.url}/operations/status`)).resolves.toMatchObject({
      metrics: expect.objectContaining({
        counters: expect.objectContaining({ "runs.completed": 1 })
      })
    });
    await expect(postJson(`${server.url}/runs/${run.id}/cancel`, {})).resolves.toMatchObject({
      id: run.id,
      status: "completed"
    });
  });

  it("queues active run input and exposes abort as a control alias", async () => {
    const { server } = await startControlledServer();
    const session = await postJson<{ id: string }>(`${server.url}/sessions`, {});
    const run = await postJson<{ id: string; status: string }>(`${server.url}/sessions/${session.id}/runs`, {
      input: "wait",
      providerId: "controlled"
    });

    expect(run).toMatchObject({ status: "running" });
    await expect(postJson(`${server.url}/runs/${run.id}/input`, {
      mode: "follow_up",
      text: "next turn"
    })).resolves.toMatchObject({
      queuedInputs: [
        expect.objectContaining({
          mode: "follow_up",
          text: "next turn",
          textPreview: "next turn"
        })
      ]
    });
    await expect(fetchJson(`${server.url}/runs/${run.id}/events`)).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ type: "queue.updated" })
      ])
    });

    await expect(postJson(`${server.url}/runs/${run.id}/abort`, {})).resolves.toMatchObject({
      id: run.id,
      status: "cancelled"
    });
  });

  it("manages session tree and generic interactions over HTTP", async () => {
    const { server } = await startControlledServer([
      "session-1",
      "branch-1",
      "run-1",
      "interaction-1"
    ]);
    const session = await postJson<{ id: string }>(`${server.url}/sessions`, { title: "Tree" });
    await expect(fetchJson(`${server.url}/sessions`)).resolves.toMatchObject({
      sessions: [expect.objectContaining({ id: session.id })]
    });
    await expect(postJson(`${server.url}/sessions/${session.id}/fork`, {
      summary: "alternate"
    })).resolves.toMatchObject({
      activeBranchId: "branch-branch-1",
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "branch-branch-1", summary: "alternate" })
      ])
    });
    await expect(fetchJson(`${server.url}/sessions/${session.id}/tree`)).resolves.toMatchObject({
      activeBranchId: "branch-branch-1",
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "main" }),
        expect.objectContaining({ id: "branch-branch-1" })
      ])
    });
    await expect(postJson(`${server.url}/sessions/${session.id}/resume`, {
      branchId: "main"
    })).resolves.toMatchObject({ activeBranchId: "main" });

    const run = await postJson<{ id: string }>(`${server.url}/sessions/${session.id}/runs`, {
      input: "wait",
      providerId: "controlled"
    });
    const interaction = await postJson<{ id: string }>(`${server.url}/sessions/${session.id}/interactions`, {
      runId: run.id,
      request: { kind: "confirm", message: "Continue?" }
    });
    await expect(postJson(`${server.url}/interactions/${interaction.id}/respond`, {
      response: true
    })).resolves.toMatchObject({
      id: interaction.id,
      status: "resolved",
      response: true
    });
    await expect(fetchJson(`${server.url}/runs/${run.id}/events`)).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ type: "interaction.requested", requestId: interaction.id }),
        expect.objectContaining({ type: "interaction.resolved", requestId: interaction.id })
      ])
    });

    await postJson(`${server.url}/runs/${run.id}/abort`, {});
  });
});

async function drainRunEvents(baseUrl: string, runId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/runs/${runId}/events`, {
    headers: { accept: "text/event-stream" }
  });
  await response.text();
}

async function startTestServer(): Promise<HostLocalServer> {
  const runtime = createAgentRuntime();
  runtime.registerProvider(createMockProvider([
    { type: "final", content: "hello from server", usage: { totalTokens: 9 } }
  ]));
  runtime.registerTool(createTestTool({ name: "echo", content: "ok" }));
  const server = new HostLocalServer({
    hostRuntime: new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1", "session-2", "run-2", "session-3", "run-3"])
    }),
    pollIntervalMs: 1
  });
  await server.listen();
  servers.push(server);
  return server;
}

async function startControlledServer(ids: string[] = ["session-1", "run-1", "input-1"]): Promise<{ server: HostLocalServer; finish: (content: string) => void }> {
  let finish: (content: string) => void = () => undefined;
  const runtime = createAgentRuntime();
  runtime.registerProvider({
    id: "controlled",
    async generate(request) {
      const content = await new Promise<string>((resolve) => {
        finish = resolve;
        request.signal?.addEventListener("abort", () => resolve("aborted"), { once: true });
      });
      return { type: "final", content };
    }
  });
  const server = new HostLocalServer({
    hostRuntime: new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(ids)
    }),
    pollIntervalMs: 1
  });
  await server.listen();
  servers.push(server);
  return { server, finish };
}

async function postJson<ResponseBody>(url: string, body: unknown): Promise<ResponseBody> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json() as Promise<ResponseBody>;
}

async function fetchJson<ResponseBody = unknown>(url: string): Promise<ResponseBody> {
  const response = await fetch(url);
  return response.json() as Promise<ResponseBody>;
}

function parseSseEventTypes(payload: string): string[] {
  return payload
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)) as { type: string })
    .map((event) => event.type);
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
