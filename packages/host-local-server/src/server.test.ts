import { afterEach, describe, expect, it } from "vitest";
import { createAgentRuntime, createMockProvider, createTestTool, type ToolDefinition } from "@guga-agent/core";
import { HostRuntime } from "@guga-agent/host-runtime";
import { HostLocalServer } from "./server";

const servers: HostLocalServer[] = [];
const TEST_BRIDGE_TOKEN = "test-bridge-token";

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("HostLocalServer", () => {
  it("exposes protocol discovery", async () => {
    const server = await startTestServer();

    await expect(fetchJson(`${server.url}/protocol`)).resolves.toMatchObject({
      version: "1",
      features: expect.arrayContaining(["permissions", "follow-up-consumption"])
    });
  });

  it("rejects cross-origin and unauthenticated state-changing bridge requests", async () => {
    const server = await startTestServer();

    await expect(postJsonWithStatus(`${server.url}/sessions`, {}, {
      origin: "https://attacker.example"
    })).resolves.toMatchObject({
      status: 403,
      body: { error: { code: "FORBIDDEN_ORIGIN" } }
    });
    await expect(postJsonWithStatus(`${server.url}/sessions`, {}, {
      omitToken: true
    })).resolves.toMatchObject({
      status: 401,
      body: { error: { code: "UNAUTHORIZED" } }
    });
  });

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

  it("responds to permission resources with HTTP error semantics", async () => {
    const server = new HostLocalServer({
      runtimeOptions: { permissions: { profile: "ask-on-write" } },
      pollIntervalMs: 1,
      bridgeToken: TEST_BRIDGE_TOKEN
    });
    server.hostRuntime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "write", name: "write_tool", input: { value: "x" } }] },
      { type: "final", content: "done" }
    ]));
    server.hostRuntime.registerTool(writeTool());
    await server.listen();
    servers.push(server);
    const session = await postJson<{ id: string }>(`${server.url}/sessions`, {});
    const run = await postJson<{ id: string }>(`${server.url}/sessions/${session.id}/runs`, {
      input: "write",
      providerId: "mock"
    });
    const permissionId = `${run.id}:write:1`;
    await waitFor(async () => {
      const permission = await fetchJson<{ status?: string }>(`${server.url}/permissions/${encodeURIComponent(permissionId)}`);
      return permission.status === "pending";
    });

    await expect(postJsonWithStatus(`${server.url}/permissions/${encodeURIComponent(permissionId)}/respond`, {
      decision: "maybe"
    })).resolves.toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } }
    });
    await expect(postJsonWithStatus(`${server.url}/permissions/${encodeURIComponent(permissionId)}/respond`, {
      decision: "allow",
      remember: "forever"
    })).resolves.toMatchObject({
      status: 400,
      body: { error: { code: "BAD_REQUEST" } }
    });
    await expect(postJsonWithStatus(`${server.url}/permissions/missing/respond`, {
      decision: "allow"
    })).resolves.toMatchObject({
      status: 404,
      body: { error: { code: "NOT_FOUND" } }
    });
    await expect(postJson(`${server.url}/permissions/${encodeURIComponent(permissionId)}/respond`, {
      decision: "allow",
      remember: "once"
    })).resolves.toMatchObject({
      id: permissionId,
      status: "allowed"
    });
    await expect(postJsonWithStatus(`${server.url}/permissions/${encodeURIComponent(permissionId)}/respond`, {
      decision: "deny"
    })).resolves.toMatchObject({
      status: 409,
      body: { error: { code: "PERMISSION_NOT_PENDING" } }
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
    pollIntervalMs: 1,
    bridgeToken: TEST_BRIDGE_TOKEN
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
    pollIntervalMs: 1,
    bridgeToken: TEST_BRIDGE_TOKEN
  });
  await server.listen();
  servers.push(server);
  return { server, finish };
}

async function postJson<ResponseBody>(url: string, body: unknown): Promise<ResponseBody> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_BRIDGE_TOKEN}`
    },
    body: JSON.stringify(body)
  });
  return response.json() as Promise<ResponseBody>;
}

async function postJsonWithStatus(
  url: string,
  body: unknown,
  options: { origin?: string; omitToken?: boolean } = {}
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.omitToken ? {} : { authorization: `Bearer ${TEST_BRIDGE_TOKEN}` }),
      ...(options.origin ? { origin: options.origin } : {})
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
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
