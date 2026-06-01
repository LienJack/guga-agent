import { describe, expect, it } from "vitest";
import { formatWebSearchResult } from "./format-result";

describe("formatWebSearchResult", () => {
  it("renders compact source metadata for model-visible results", () => {
    expect(formatWebSearchResult({
      query: "current TypeScript release",
      provider: "mock",
      fetchedAt: "2026-06-01T00:00:00.000Z",
      results: [{
        title: "TypeScript",
        url: "https://www.typescriptlang.org/",
        snippet: "TypeScript adds types to JavaScript.",
        rank: 1,
        fetchedAt: "2026-06-01T00:00:00.000Z",
        publishedAt: "2026-05-30T00:00:00.000Z"
      }]
    })).toContain([
      "1. TypeScript",
      "URL: https://www.typescriptlang.org/",
      "Snippet: TypeScript adds types to JavaScript.",
      "Fetched: 2026-06-01T00:00:00.000Z",
      "Published: 2026-05-30T00:00:00.000Z"
    ].join("\n"));
  });

  it("honors contextMaxCharacters before runtime result budgeting", () => {
    const content = formatWebSearchResult({
      query: "large",
      provider: "mock",
      fetchedAt: "2026-06-01T00:00:00.000Z",
      results: Array.from({ length: 5 }, (_, index) => ({
        title: `Result ${index}`,
        url: `https://example.com/${index}`,
        snippet: "x".repeat(200),
        rank: index + 1,
        fetchedAt: "2026-06-01T00:00:00.000Z"
      }))
    }, { maxCharacters: 180 });

    expect(content.length).toBeLessThanOrEqual(180);
    expect(content).toContain("formatter omitted");
  });
});
