import { describe, expect, it, vi } from "vitest";
import type { HostClient } from "@guga-agent/host-sdk";
import { executeWorkbenchCommand, parseWorkbenchInput } from "./commands";

describe("workbench slash commands", () => {
  it("routes normal text outside the slash command router", () => {
    expect(parseWorkbenchInput("write tests")).toEqual({
      kind: "prompt",
      text: "write tests"
    });
  });

  it("rejects unknown slash commands without sending to agent", async () => {
    const result = await executeWorkbenchCommand(parseWorkbenchInput("/modl fast"), context());

    expect(result).toMatchObject({
      ok: false,
      error: "Unknown command: /modl"
    });
  });

  it("lists and selects models from the CLI config registry", async () => {
    const ctx = context();

    await expect(executeWorkbenchCommand(parseWorkbenchInput("/models"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "list-models",
      message: expect.stringContaining("* fast -> gpt-fast")
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/model slow"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "select-model",
      data: expect.objectContaining({
        id: "slow",
        modelId: "gpt-slow"
      })
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/model missing"), ctx)).resolves.toMatchObject({
      ok: false,
      error: "Unknown model: missing"
    });
  });

  it("switches profiles with new-session semantics", async () => {
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/profile code"), context())).resolves.toMatchObject({
      ok: true,
      action: "select-profile",
      data: {
        profileId: "code",
        requiresNewSession: true
      }
    });
  });

  it("creates, resumes, forks, and checks status through HostClient resources", async () => {
    const client = fakeClient();
    const ctx = context({
      client,
      activeSessionId: "session-1",
      activeBranchId: "main",
      activeRunId: "run-1"
    });

    await expect(executeWorkbenchCommand(parseWorkbenchInput("/new New work"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "new-session",
      message: "new session session-2"
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/resume session-1 branch-1"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "resume-session"
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/fork alternate"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "fork-session",
      message: "forked branch branch-2"
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/status"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "status",
      message: "providers=1 tools=1 operations=1 runs=1 tokens=12"
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/tree"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "session-tree",
      message: expect.stringContaining("* branch-2")
    });

    expect(client.createSession).toHaveBeenCalledWith({ title: "New work" });
    expect(client.resumeSession).toHaveBeenCalledWith("session-1", { branchId: "branch-1" });
    expect(client.forkSession).toHaveBeenCalledWith("session-1", {
      parentBranchId: "main",
      createdFromRunId: "run-1",
      summary: "alternate"
    });
    expect(client.getSessionTree).toHaveBeenCalledWith("session-1");
  });

  it("reads permission and MCP status from capabilities", async () => {
    const ctx = context();

    await expect(executeWorkbenchCommand(parseWorkbenchInput("/permissions"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "permissions",
      message: expect.stringContaining("tool:fs_write registered")
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/mcp"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "mcp",
      message: expect.stringContaining("tool:mcp_tool registered")
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/tools"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "tools",
      message: expect.stringContaining("tool:fs_write registered")
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/skills"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "skills",
      message: "No matching capabilities."
    });
  });

  it("queues follow-ups and aborts active runs through slash commands", async () => {
    const client = fakeClient();
    const ctx = context({ client, activeRunId: "run-1" });

    await expect(executeWorkbenchCommand(parseWorkbenchInput("/follow next turn"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "follow-up",
      message: "queued follow-up"
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/abort"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "abort-run",
      message: "abort requested"
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/respond interaction-1 true"), ctx)).resolves.toMatchObject({
      ok: true,
      action: "respond-interaction",
      message: "responded to interaction interaction-1"
    });

    expect(client.sendRunInput).toHaveBeenCalledWith("run-1", { mode: "follow_up", text: "next turn" });
    expect(client.abortRun).toHaveBeenCalledWith("run-1");
    expect(client.respondInteraction).toHaveBeenCalledWith("interaction-1", true);
  });

  it("returns command errors when HostClient resource calls fail", async () => {
    const client = fakeClient();
    vi.mocked(client.resumeSession).mockRejectedValueOnce(new Error("missing branch"));
    vi.mocked(client.getOperationalStatus).mockRejectedValueOnce(new Error("status unavailable"));

    await expect(executeWorkbenchCommand(parseWorkbenchInput("/resume session-1 missing"), context({ client }))).resolves.toMatchObject({
      ok: false,
      error: "missing branch"
    });
    await expect(executeWorkbenchCommand(parseWorkbenchInput("/status"), context({ client }))).resolves.toMatchObject({
      ok: false,
      error: "status unavailable"
    });
  });
});

function context(overrides: Partial<Parameters<typeof executeWorkbenchCommand>[1]> = {}) {
  return {
    client: fakeClient(),
    config: {
      defaultModel: "fast",
      models: [
        { id: "fast", modelId: "gpt-fast" },
        { id: "slow", modelId: "gpt-slow" }
      ]
    },
    ...overrides
  };
}

function fakeClient(): HostClient {
  return {
    createSession: vi.fn(async (request = {}) => ({
      id: "session-2",
      ...(request.title ? { title: request.title } : {}),
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      activeBranchId: "main"
    })),
    listSessions: vi.fn(async () => []),
    getSession: vi.fn(async (sessionId) => ({
      id: sessionId,
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z"
    })),
    resumeSession: vi.fn(async (sessionId, request = {}) => ({
      id: sessionId,
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      activeBranchId: request.branchId ?? "main"
    })),
    forkSession: vi.fn(async (sessionId) => ({
      id: sessionId,
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      activeBranchId: "branch-2"
    })),
    getSessionTree: vi.fn(async (sessionId) => ({
      sessionId,
      activeBranchId: "branch-2",
      branches: [
        {
          id: "main",
          sessionId,
          createdAt: "2026-05-28T00:00:00.000Z",
          updatedAt: "2026-05-28T00:00:00.000Z"
        },
        {
          id: "branch-2",
          sessionId,
          parentBranchId: "main",
          summary: "alternate",
          createdAt: "2026-05-28T00:00:00.000Z",
          updatedAt: "2026-05-28T00:00:00.000Z"
        }
      ]
    })),
    startRun: vi.fn(async () => runResource()),
    getRun: vi.fn(async () => runResource()),
    listRunEvents: vi.fn(async () => []),
    streamRunEvents: vi.fn(async function* () {}),
    sendRunInput: vi.fn(async () => runResource()),
    cancelRun: vi.fn(async () => runResource()),
    abortRun: vi.fn(async () => runResource()),
    requestInteraction: vi.fn(async () => ({
      id: "interaction-1",
      sessionId: "session-1",
      status: "pending",
      request: { kind: "confirm", message: "Continue?" },
      createdAt: "2026-05-28T00:00:00.000Z"
    })),
    getInteraction: vi.fn(async () => ({
      id: "interaction-1",
      sessionId: "session-1",
      status: "pending",
      request: { kind: "confirm", message: "Continue?" },
      createdAt: "2026-05-28T00:00:00.000Z"
    })),
    respondInteraction: vi.fn(async () => ({
      id: "interaction-1",
      sessionId: "session-1",
      status: "resolved",
      request: { kind: "confirm", message: "Continue?" },
      createdAt: "2026-05-28T00:00:00.000Z",
      resolvedAt: "2026-05-28T00:00:01.000Z"
    })),
    listCapabilities: vi.fn(async () => [
      { type: "tool", name: "fs_write", source: "plugin", status: "registered", trust: { level: "first-party" } },
      { type: "tool", name: "mcp_tool", source: "mcp", status: "registered", ownerPluginId: "code-agent-mcp" },
      { type: "operation", name: "provider.health", source: "plugin", status: "registered" }
    ]),
    listProviderHealth: vi.fn(async () => []),
    listAuditSummaries: vi.fn(async () => []),
    getMetricsSnapshot: vi.fn(async () => ({ updatedAt: "2026-05-28T00:00:00.000Z", counters: {} })),
    getOperationalStatus: vi.fn(async () => ({
      updatedAt: "2026-05-28T00:00:00.000Z",
      capabilities: [
        { type: "tool", name: "fs_write", source: "plugin", status: "registered" },
        { type: "operation", name: "provider.health", source: "plugin", status: "registered" }
      ],
      health: [{ providerId: "mock", status: "healthy", checkedAt: "2026-05-28T00:00:00.000Z", diagnostics: [] }],
      audit: [{ runId: "run-1", toolCalls: { started: 0, completed: 0, failed: 0 }, permissions: { requested: 0, allowed: 0, denied: 0 }, usage: {} }],
      metrics: { updatedAt: "2026-05-28T00:00:00.000Z", counters: { "usage.total_tokens": 12 } },
      diagnostics: []
    }))
  };
}

function runResource() {
  return {
    id: "run-1",
    sessionId: "session-1",
    status: "completed" as const,
    input: "hello",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    lastSeq: 1
  };
}
