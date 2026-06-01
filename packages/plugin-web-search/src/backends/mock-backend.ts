import type {
  WebSearchBackend,
  WebSearchBackendRequest,
  WebSearchBackendResponse,
  WebSearchProviderId,
  WebSearchResultItem
} from "../types";

export type MockWebSearchBackendOptions = {
  providerId?: WebSearchProviderId;
  results?: readonly WebSearchResultItem[] | ((request: WebSearchBackendRequest) => readonly WebSearchResultItem[]);
  metadata?: Record<string, unknown>;
};

export function createMockWebSearchBackend(options: MockWebSearchBackendOptions = {}): WebSearchBackend {
  const provider = options.providerId ?? "mock";
  return {
    id: provider,
    availability: () => ({ status: "available" }),
    search(request) {
      const source = typeof options.results === "function"
        ? options.results(request)
        : options.results ?? defaultResults(request);
      const results = [...source].slice(0, request.maxResults).map((result, index) => ({
        ...result,
        rank: index + 1,
        fetchedAt: result.fetchedAt || request.fetchedAt
      }));
      return {
        query: request.query,
        provider,
        fetchedAt: request.fetchedAt,
        results,
        metadata: {
          mock: true,
          ...(options.metadata ? options.metadata : {})
        }
      };
    }
  };
}

function defaultResults(request: WebSearchBackendRequest): WebSearchResultItem[] {
  const slug = encodeURIComponent(request.query.toLowerCase().replace(/\s+/g, "-"));
  return Array.from({ length: request.maxResults }, (_, index) => ({
    title: `Mock result ${index + 1} for ${request.query}`,
    url: `https://example.com/search/${slug}/${index + 1}`,
    snippet: `Deterministic mock snippet ${index + 1} for ${request.query}.`,
    rank: index + 1,
    fetchedAt: request.fetchedAt,
    metadata: { mockRank: index + 1 }
  }));
}
