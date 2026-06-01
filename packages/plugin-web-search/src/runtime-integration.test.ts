import { describe, expect, it, vi } from "vitest";
import { AgentEventType, createAgentRuntime, createMockProvider } from "@guga-agent/core";
import { createMockWebSearchBackend, createWebSearchPlugin } from "./index";
import type { WebSearchBackend } from "./types";

describe("web search runtime integration", () => {
  it("runs web_search through permission, execution pipeline, and lifecycle events", async () => {
    const search = vi.fn(async (request) => ({
      query: request.query,
      provider: "mock" as const,
      fetchedAt: request.fetchedAt,
      results: [{
        title: "Guga",
        url: "https://example.com/guga",
        snippet: "A result",
        rank: 1,
        fetchedAt: request.fetchedAt
      }]
    }));
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createWebSearchPlugin({ backend: { id: "mock", search } })],
      permissions: {
        resolver: () => ({ action: "allow", remember: "once", source: "host" })
      }
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "search-1", name: "web_search", input: { query: "latest Guga", maxResults: 1 } }] },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.content ?? "missing result"
      })
    ]));

    const result = await runtime.run({ input: "search", providerId: "mock", runId: "run-web-search" });

    expect(result).toMatchObject({
      ok: true,
      finalAnswer: expect.stringContaining("1. Guga")
    });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      query: "latest Guga",
      maxResults: 1
    }));
    expect(result.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      AgentEventType.ToolQueued,
      AgentEventType.PermissionRequested,
      AgentEventType.ToolStarted,
      AgentEventType.ToolResult,
      AgentEventType.ToolCompleted
    ]));
    await runtime.dispose();
  });

  it("filters missing-backend web_search from projection and blocks direct model calls", async () => {
    const projectedTools: string[][] = [];
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createWebSearchPlugin({ providerId: "brave" })]
    });
    runtime.registerProvider(createMockProvider([
      (request) => {
        projectedTools.push(request.tools.map((tool) => tool.name));
        return { type: "tool_calls", toolCalls: [{ id: "search-1", name: "web_search", input: { query: "should not run" } }] };
      },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.content ?? "missing result"
      })
    ]));

    const result = await runtime.run({ input: "search", providerId: "mock", runId: "run-web-search-missing" });

    expect(projectedTools[0]).toEqual([]);
    expect(result).toMatchObject({
      ok: true,
      finalAnswer: expect.stringContaining("TOOL_UNAVAILABLE: Web search backend is not configured")
    });
    await runtime.dispose();
  });

  it("returns a permission-denied observation when host denies web search", async () => {
    const search = vi.fn();
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createWebSearchPlugin({ backend: { id: "mock", search } as WebSearchBackend })],
      permissions: {
        resolver: () => ({ action: "deny", remember: "once", source: "host", reason: "no network" })
      }
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "search-1", name: "web_search", input: { query: "denied" } }] },
      (request) => ({ type: "final", content: request.messages.at(-1)?.content ?? "missing result" })
    ]));

    const result = await runtime.run({ input: "search", providerId: "mock", runId: "run-web-search-deny" });

    expect(search).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      finalAnswer: expect.stringContaining("TOOL_PERMISSION_DENIED: no network")
    });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.ToolDenied);
    await runtime.dispose();
  });

  it("projects and executes web_search for trusted-session only when explicitly configured", async () => {
    const projectedTools: string[][] = [];
    const search = vi.fn(async (request) => ({
      query: request.query,
      provider: "mock" as const,
      fetchedAt: request.fetchedAt,
      results: [{
        title: "Trusted result",
        url: "https://example.com/trusted",
        snippet: "Allowed by trusted-session profile",
        rank: 1,
        fetchedAt: request.fetchedAt
      }]
    }));
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createWebSearchPlugin({
        backend: { id: "mock", search },
        permission: { trustedSessionAction: "allow" }
      })],
      permissions: { profile: "trusted-session" }
    });
    runtime.registerProvider(createMockProvider([
      (request) => {
        projectedTools.push(request.tools.map((tool) => tool.name));
        return { type: "tool_calls", toolCalls: [{ id: "search-1", name: "web_search", input: { query: "trusted" } }] };
      },
      (request) => ({ type: "final", content: request.messages.at(-1)?.content ?? "missing result" })
    ]));

    const result = await runtime.run({ input: "search", providerId: "mock", runId: "run-web-search-trusted" });

    expect(projectedTools[0]).toContain("web_search");
    expect(search).toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      finalAnswer: expect.stringContaining("Trusted result")
    });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.PermissionResolved);
    await runtime.dispose();
  });

  it("applies runtime result budgeting and preserves source audit metadata", async () => {
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createWebSearchPlugin({
        backend: createMockWebSearchBackend({
          results: Array.from({ length: 5 }, (_, index) => ({
            title: `Result ${index + 1}`,
            url: `https://example.com/${index + 1}`,
            snippet: "x".repeat(300),
            rank: index + 1,
            fetchedAt: "2026-06-01T00:00:00.000Z"
          }))
        }),
        permission: { defaultAction: "allow" },
        resultBudget: { maxContentChars: 240, strategy: "reference" }
      })]
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "search-1", name: "web_search", input: { query: "large", maxResults: 5, contextMaxCharacters: 20_000 } }] },
      (request) => ({ type: "final", content: request.messages.at(-1)?.content ?? "missing result" })
    ]));

    const result = await runtime.run({ input: "search", providerId: "mock", runId: "run-web-search-budget" });
    const budgeted = result.events.find((event) => event.type === AgentEventType.ToolResultBudgeted);
    const toolResult = result.events.find((event) => event.type === AgentEventType.ToolResult);

    expect(result).toMatchObject({
      ok: true,
      finalAnswer: expect.stringContaining("Tool output stored as reference")
    });
    expect(budgeted).toBeDefined();
    expect(toolResult).toMatchObject({
      result: {
        metadata: {
          webSearch: {
            sourceUrls: expect.arrayContaining(["https://example.com/1"])
          }
        },
        budget: {
          applied: true,
          reference: expect.objectContaining({ type: "buffer" })
        }
      }
    });
    await runtime.dispose();
  });

  it("turns timed-out searches into terminal timeout lifecycle events", async () => {
    const events: string[] = [];
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createWebSearchPlugin({
        permission: { defaultAction: "allow" },
        timeoutMs: 5,
        backend: {
          id: "mock",
          search: (request) => new Promise((_, reject) => {
            request.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "TimeoutError")), { once: true });
          })
        }
      })]
    });
    runtime.onEvent((event) => events.push(event.type));

    const result = await runtime.invokeTool({
      runId: "run-web-search-timeout",
      turn: 0,
      source: "host",
      call: { id: "search-1", name: "web_search", input: { query: "slow" } }
    });

    expect(result).toMatchObject({
      reason: "timeout",
      result: {
        ok: false,
        error: { code: "TOOL_TIMEOUT" }
      }
    });
    expect(events.filter((event) => event === AgentEventType.ToolTimeout)).toHaveLength(1);
    expect(events.filter((event) => [
      AgentEventType.ToolCompleted,
      AgentEventType.ToolFailed,
      AgentEventType.ToolCancelled,
      AgentEventType.ToolTimeout
    ].includes(event as AgentEventType))).toHaveLength(1);
    await runtime.dispose();
  });
});
