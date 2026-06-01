import type {
  WebSearchBackend,
  WebSearchBackendRequest,
  WebSearchBackendResponse,
  WebSearchProviderId,
  WebSearchResultItem
} from "../types";

export type BraveSearchFetch = (
  input: string | URL,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export type BraveSearchBackendOptions = {
  apiKey?: string;
  apiKeyEnv?: string;
  env?: NodeJS.ProcessEnv;
  endpoint?: string;
  fetch?: BraveSearchFetch;
  providerId?: WebSearchProviderId;
};

export class BraveSearchBackendError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BraveSearchBackendError";
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

export function createBraveSearchBackend(options: BraveSearchBackendOptions = {}): WebSearchBackend {
  const provider = options.providerId ?? "brave";
  const endpoint = options.endpoint ?? "https://api.search.brave.com/res/v1/web/search";
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const apiKey = resolveApiKey(options);

  return {
    id: provider,
    availability: () => {
      if (!apiKey) {
        return {
          status: "missing-backend",
          reason: "Brave Search API key is not configured",
          metadata: { provider }
        };
      }
      if (!fetchImpl) {
        return {
          status: "missing-backend",
          reason: "Fetch implementation is not available for Brave Search",
          metadata: { provider }
        };
      }
      return { status: "available" };
    },
    async search(request): Promise<WebSearchBackendResponse> {
      if (!apiKey) {
        throw new BraveSearchBackendError("BRAVE_API_KEY_MISSING", "Brave Search API key is not configured", { provider });
      }
      if (!fetchImpl) {
        throw new BraveSearchBackendError("BRAVE_FETCH_MISSING", "Fetch implementation is not available", { provider });
      }
      const url = braveSearchUrl(endpoint, request);
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey
        },
        ...(request.signal ? { signal: request.signal } : {})
      });

      if (!response.ok) {
        throw new BraveSearchBackendError("BRAVE_HTTP_ERROR", `Brave Search returned HTTP ${response.status}`, {
          provider,
          status: response.status,
          statusText: response.statusText,
          body: await safeReadText(response, apiKey)
        });
      }

      const body = await response.json();
      return {
        query: request.query,
        provider,
        fetchedAt: request.fetchedAt,
        results: normalizeBraveResults(body, request),
        metadata: {
          provider,
          endpoint: new URL(endpoint).origin,
          braveQuery: url.searchParams.get("q") ?? request.query
        }
      };
    }
  };
}

export function braveSearchUrl(endpoint: string, request: WebSearchBackendRequest): URL {
  const url = new URL(endpoint);
  url.searchParams.set("q", braveQuery(request));
  url.searchParams.set("count", String(Math.min(request.maxResults, 20)));
  const freshness = freshnessForRecency(request.recencyDays);
  if (freshness) {
    url.searchParams.set("freshness", freshness);
  }
  return url;
}

function resolveApiKey(options: BraveSearchBackendOptions): string | undefined {
  if (options.apiKey?.trim()) {
    return options.apiKey.trim();
  }
  const env = options.env ?? process.env;
  const envName = options.apiKeyEnv ?? "BRAVE_SEARCH_API_KEY";
  return env[envName]?.trim() || undefined;
}

function braveQuery(request: WebSearchBackendRequest): string {
  const allowed = request.allowedDomains.map((domain) => `site:${domain}`);
  const blocked = request.blockedDomains.map((domain) => `-site:${domain}`);
  return [request.query, ...allowed, ...blocked].join(" ").trim();
}

function freshnessForRecency(days: number | undefined): string | undefined {
  if (days === undefined) {
    return undefined;
  }
  if (days <= 1) {
    return "pd";
  }
  if (days <= 7) {
    return "pw";
  }
  if (days <= 31) {
    return "pm";
  }
  return "py";
}

function normalizeBraveResults(body: unknown, request: WebSearchBackendRequest): WebSearchResultItem[] {
  const results = webResults(body).slice(0, request.maxResults);
  return results.map((item, index) => {
    const published = publishedAt(item);
    return {
      title: stringField(item, "title") ?? "Untitled result",
      url: stringField(item, "url") ?? "about:blank",
      snippet: stringField(item, "description") ?? stringField(item, "snippet") ?? "",
      rank: index + 1,
      fetchedAt: request.fetchedAt,
      ...(published ? { publishedAt: published } : {}),
      metadata: {
        providerRank: index + 1,
        familyFriendly: booleanField(item, "family_friendly"),
        language: stringField(item, "language"),
        age: stringField(item, "age"),
        extraSnippets: arrayField(item, "extra_snippets")
      }
    };
  });
}

function webResults(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !isRecord(body.web) || !Array.isArray(body.web.results)) {
    return [];
  }
  return body.web.results.filter(isRecord);
}

async function safeReadText(response: { text(): Promise<string> }, apiKey: string): Promise<string> {
  try {
    const text = await response.text();
    return redactBraveSecretText(text.slice(0, 400), apiKey);
  } catch {
    return "";
  }
}

function redactBraveSecretText(value: string, apiKey: string): string {
  const withoutKnownKey = apiKey ? value.split(apiKey).join("[redacted]") : value;
  return withoutKnownKey
    .replace(/(x-subscription-token\s*[:=]\s*)\S+/gi, "$1[redacted]")
    .replace(/(authorization\s*[:=]\s*)\S+/gi, "$1[redacted]");
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = record[key];
  return Array.isArray(value) ? value : undefined;
}

function publishedAt(record: Record<string, unknown>): string | undefined {
  return stringField(record, "page_age") ?? stringField(record, "age") ?? stringField(record, "published_at");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
