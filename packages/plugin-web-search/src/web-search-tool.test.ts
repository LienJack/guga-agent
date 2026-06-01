import { describe, expect, it, vi } from "vitest";
import type { WebSearchBackend } from "./types";
import { createMockWebSearchBackend, createWebSearchTool } from "./index";

const call = { id: "call-1", name: "web_search", input: {} };
const now = () => new Date("2026-06-01T00:00:00.000Z");

describe("createWebSearchTool", () => {
  it("runs a mock backend and returns ranked source metadata", async () => {
    const backend = createMockWebSearchBackend({
      results: Array.from({ length: 3 }, (_, index) => ({
        title: `Result ${index + 1}`,
        url: `https://example.com/${index + 1}`,
        snippet: `Snippet ${index + 1}`,
        rank: index + 1,
        fetchedAt: "ignored"
      }))
    });
    const tool = createWebSearchTool({ backend, now });

    const result = await tool.execute({ query: "current TypeScript release", maxResults: 3 }, { call });

    expect(result).toMatchObject({
      ok: true,
      content: expect.stringContaining("1. Result 1"),
      metadata: {
        webSearch: {
          query: "current TypeScript release",
          provider: "mock",
          resultCount: 3,
          sourceUrls: ["https://example.com/1", "https://example.com/2", "https://example.com/3"]
        }
      }
    });
  });

  it("uses bounded defaults without leaking backend-specific defaults", async () => {
    const search = vi.fn(async (request) => ({
      query: request.query,
      provider: "mock" as const,
      fetchedAt: request.fetchedAt,
      results: []
    }));
    const tool = createWebSearchTool({ backend: { id: "mock", search }, now });

    await tool.execute({ query: "defaults" }, { call });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      query: "defaults",
      maxResults: 5,
      allowedDomains: [],
      blockedDomains: [],
      searchType: "web",
      contextMaxCharacters: 8000
    }));
  });

  it("rejects empty queries and over-limit maxResults before invoking the backend", async () => {
    const search = vi.fn();
    const tool = createWebSearchTool({ backend: { id: "mock", search } as WebSearchBackend });

    await expect(tool.execute({ query: " ", maxResults: 99 }, { call })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "WEB_SEARCH_INPUT_INVALID",
        details: expect.arrayContaining([
          expect.objectContaining({ code: "WEB_SEARCH_QUERY_REQUIRED" }),
          expect.objectContaining({ code: "WEB_SEARCH_NUMBER_OUT_OF_RANGE", path: "maxResults" })
        ])
      }
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("fails invalid domain filters before invoking the backend", async () => {
    const search = vi.fn();
    const tool = createWebSearchTool({ backend: { id: "mock", search } as WebSearchBackend });

    await expect(tool.execute({ query: "test", allowedDomains: ["not a domain"] }, { call })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "WEB_SEARCH_INPUT_INVALID",
        details: [expect.objectContaining({ code: "WEB_SEARCH_DOMAIN_INVALID" })]
      }
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("applies allowed and blocked domains after backend normalization", async () => {
    const tool = createWebSearchTool({
      now,
      backend: createMockWebSearchBackend({
        results: [
          { title: "Allowed", url: "https://docs.example.com/a", snippet: "yes", rank: 1, fetchedAt: "ignored" },
          { title: "Blocked", url: "https://news.example.com/b", snippet: "no", rank: 2, fetchedAt: "ignored" },
          { title: "Other", url: "https://other.test/c", snippet: "no", rank: 3, fetchedAt: "ignored" }
        ]
      })
    });

    const result = await tool.execute({
      query: "domain filtering",
      allowedDomains: ["example.com"],
      blockedDomains: ["news.example.com"]
    }, { call });

    expect(result).toMatchObject({
      ok: true,
      content: expect.stringContaining("Allowed"),
      metadata: { webSearch: { resultCount: 1, filteredCount: 2 } }
    });
    expect(result.ok && result.content).not.toContain("Blocked");
  });

  it("normalizes backend errors into stable failures", async () => {
    const tool = createWebSearchTool({
      backend: {
        id: "mock",
        search: async () => {
          throw new Error("backend down apiKey=secret");
        }
      }
    });

    await expect(tool.execute({ query: "test" }, { call })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "WEB_SEARCH_BACKEND_FAILED",
        details: {
          message: "backend down apiKey=[redacted]"
        }
      }
    });
  });

  it("returns unavailable when no backend is configured", async () => {
    const tool = createWebSearchTool({ providerId: "brave" });

    await expect(tool.execute({ query: "test" }, { call })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "WEB_SEARCH_UNAVAILABLE",
        message: "Web search backend is not configured"
      }
    });
  });

  it("returns cancelled when the execution signal aborts", async () => {
    const controller = new AbortController();
    const tool = createWebSearchTool({
      backend: {
        id: "mock",
        search: async () => {
          controller.abort();
          throw new DOMException("Aborted", "AbortError");
        }
      }
    });

    await expect(tool.execute({ query: "test" }, { call, signal: controller.signal })).resolves.toMatchObject({
      ok: false,
      error: { code: "WEB_SEARCH_CANCELLED" }
    });
  });
});
