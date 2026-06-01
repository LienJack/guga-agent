import { describe, expect, it, vi } from "vitest";
import { braveSearchUrl, createBraveSearchBackend } from "./brave-backend";
import type { WebSearchBackendRequest } from "../types";

const request: WebSearchBackendRequest = {
  query: "machine learning tutorials",
  maxResults: 3,
  allowedDomains: ["example.com"],
  blockedDomains: ["spam.test"],
  recencyDays: 7,
  searchType: "web",
  contextMaxCharacters: 8000,
  fetchedAt: "2026-06-01T00:00:00.000Z"
};

describe("brave web search backend", () => {
  it("reports missing-backend availability when the API key is absent", () => {
    const backend = createBraveSearchBackend({ env: {} });

    expect(backend.availability?.({})).toMatchObject({
      status: "missing-backend",
      reason: "Brave Search API key is not configured"
    });
  });

  it("builds Brave web search requests with auth, bounded count, freshness, and site filters", async () => {
    const fetch = vi.fn(async () => okJson({
      web: {
        results: [{
          title: "ML",
          url: "https://example.com/ml",
          description: "A result",
          age: "2026-05-31"
        }]
      }
    }));
    const backend = createBraveSearchBackend({ apiKey: "secret", fetch });

    await expect(backend.search(request)).resolves.toMatchObject({
      provider: "brave",
      results: [{
        title: "ML",
        url: "https://example.com/ml",
        snippet: "A result",
        rank: 1,
        publishedAt: "2026-05-31"
      }]
    });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain("https://api.search.brave.com/res/v1/web/search?");
    expect(new URL(String(url)).searchParams.get("count")).toBe("3");
    expect(new URL(String(url)).searchParams.get("freshness")).toBe("pw");
    expect(new URL(String(url)).searchParams.get("q")).toBe("machine learning tutorials site:example.com -site:spam.test");
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": "secret"
      }
    });
  });

  it("normalizes provider responses with missing optional fields", async () => {
    const backend = createBraveSearchBackend({
      apiKey: "secret",
      fetch: async () => okJson({ web: { results: [{ url: "https://example.com/no-title" }] } })
    });

    await expect(backend.search({ ...request, allowedDomains: [], blockedDomains: [] })).resolves.toMatchObject({
      results: [{
        title: "Untitled result",
        url: "https://example.com/no-title",
        snippet: "",
        fetchedAt: "2026-06-01T00:00:00.000Z"
      }]
    });
  });

  it("sanitizes non-2xx failures without leaking the subscription token", async () => {
    const backend = createBraveSearchBackend({
      apiKey: "secret-token",
      fetch: async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({}),
        text: async () => "invalid token secret-token"
      })
    });

    await expect(backend.search(request)).rejects.toMatchObject({
      code: "BRAVE_HTTP_ERROR",
      details: {
        status: 401,
        body: "invalid token [redacted]"
      }
    });
  });

  it("maps recency to Brave freshness parameters", () => {
    expect(braveSearchUrl("https://api.search.brave.com/res/v1/web/search", { ...request, recencyDays: 1 }).searchParams.get("freshness")).toBe("pd");
    expect(braveSearchUrl("https://api.search.brave.com/res/v1/web/search", { ...request, recencyDays: 31 }).searchParams.get("freshness")).toBe("pm");
    expect(braveSearchUrl("https://api.search.brave.com/res/v1/web/search", { ...request, recencyDays: 365 }).searchParams.get("freshness")).toBe("py");
  });
});

function okJson(value: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => value,
    text: async () => JSON.stringify(value)
  };
}
