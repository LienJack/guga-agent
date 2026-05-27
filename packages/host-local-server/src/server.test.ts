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

    expect(run).toMatchObject({ status: "completed", finalAnswer: "hello from server" });

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

    await expect(fetchJson(`${server.url}/capabilities`)).resolves.toMatchObject({
      capabilities: expect.arrayContaining([
        expect.objectContaining({ type: "tool", name: "echo" })
      ])
    });
    await expect(postJson(`${server.url}/runs/${run.id}/cancel`, {})).resolves.toMatchObject({
      id: run.id,
      status: "completed"
    });
  });
});

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
