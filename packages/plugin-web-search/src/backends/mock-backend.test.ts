import { describe, expect, it } from "vitest";
import { createMockWebSearchBackend } from "./mock-backend";

describe("mock web search backend", () => {
  it("returns deterministic ranked results for tests and examples", async () => {
    const backend = createMockWebSearchBackend();
    expect(await backend.search({
      query: "guga web search",
      maxResults: 2,
      allowedDomains: [],
      blockedDomains: [],
      searchType: "web",
      contextMaxCharacters: 8000,
      fetchedAt: "2026-06-01T00:00:00.000Z"
    })).toMatchObject({
      provider: "mock",
      results: [
        { rank: 1, url: expect.stringContaining("guga-web-search") },
        { rank: 2, url: expect.stringContaining("guga-web-search") }
      ]
    });
  });
});
