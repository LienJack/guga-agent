import { describe, expect, it } from "vitest";
import { applyDomainPolicy, domainMatches, hostForUrl, normalizeDomainFilter, normalizeDomainFilters } from "./domain-policy";
import type { WebSearchResultItem } from "./types";

const fetchedAt = "2026-06-01T00:00:00.000Z";

describe("domain policy", () => {
  it("normalizes domains and URL-shaped filters", () => {
    expect(normalizeDomainFilter(" HTTPS://Docs.Example.COM/path ")).toBe("docs.example.com");
    expect(normalizeDomainFilter("*.example.com")).toBe("example.com");
    expect(normalizeDomainFilters(["Example.com", "https://Sub.Example.com/x"])).toEqual({
      ok: true,
      domains: ["example.com", "sub.example.com"]
    });
  });

  it("rejects invalid domain filters instead of widening search", () => {
    expect(normalizeDomainFilters(["example.com", "not a domain"])).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "WEB_SEARCH_DOMAIN_INVALID" })]
    });
  });

  it("matches exact hosts and subdomains", () => {
    expect(domainMatches("www.example.com", "example.com")).toBe(true);
    expect(domainMatches("badexample.com", "example.com")).toBe(false);
    expect(hostForUrl("https://Docs.Example.com/a")).toBe("docs.example.com");
  });

  it("applies allowed and blocked domains deterministically", () => {
    const results: WebSearchResultItem[] = [
      item("https://docs.example.com/a"),
      item("https://news.example.com/b"),
      item("https://other.test/c"),
      item("not-a-url")
    ];

    expect(applyDomainPolicy(results, {
      allowedDomains: ["example.com"],
      blockedDomains: ["news.example.com"]
    })).toMatchObject({
      results: [{ url: "https://docs.example.com/a" }],
      filtered: [
        { url: "https://news.example.com/b" },
        { url: "https://other.test/c" },
        { url: "not-a-url" }
      ]
    });
  });
});

function item(url: string): WebSearchResultItem {
  return {
    title: url,
    url,
    snippet: "snippet",
    rank: 1,
    fetchedAt
  };
}
