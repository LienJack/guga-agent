import type { ToolAvailability, ToolAvailabilityContext, ToolDefinition, ToolResult } from "@guga-agent/core";
import { applyDomainPolicy } from "./domain-policy";
import { formatWebSearchResult } from "./format-result";
import { parseWebSearchInput, webSearchInputSchema } from "./input-schema";
import {
  WEB_SEARCH_PACKAGE_NAME,
  WEB_SEARCH_TOOL_NAME,
  type CreateWebSearchToolOptions,
  type NormalizedWebSearchInput,
  type WebSearchBackendResponse
} from "./types";

const defaultTimeoutMs = 15_000;

export function createWebSearchTool(options: CreateWebSearchToolOptions = {}): ToolDefinition {
  const providerId = options.providerId ?? options.backend?.id ?? "unconfigured";
  return {
    name: WEB_SEARCH_TOOL_NAME,
    description: "Search the public web for recent or external information and return structured source results.",
    effect: "external",
    inputSchema: webSearchInputSchema,
    runtime: {
      permission: {
        defaultAction: options.permission?.defaultAction ?? "ask",
        profileActions: {
          headless: "deny",
          background: "deny",
          ...(options.permission?.trustedSessionAction ? { "trusted-session": options.permission.trustedSessionAction } : {})
        },
        scope: "resource",
        reason: "Web search sends the query to an external search provider.",
        prompt: {
          title: "Search the web",
          summary: "Send this query to the configured web search provider."
        }
      },
      executionMode: "interactive",
      timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
      scheduler: {
        concurrency: "serial",
        resources: {
          mode: "extractor",
          extract: (input) => [{
            kind: "custom",
            access: "execute",
            value: webSearchResourceValue(input)
          }]
        }
      },
      resultBudget: options.resultBudget ?? { maxContentChars: 12_000, strategy: "reference" },
      renderer: {
        category: "search",
        label: "Web search",
        icon: "search"
      },
      source: {
        kind: "first-party",
        packageName: WEB_SEARCH_PACKAGE_NAME,
        debugName: WEB_SEARCH_TOOL_NAME
      },
      backend: {
        kind: "custom",
        optional: true,
        description: `Web search backend (${providerId})`
      },
      availability: (context) => resolveToolAvailability(options, context),
      visibility: "model"
    },
    async execute(input, context): Promise<ToolResult> {
      const availability = resolveToolAvailability(options, {});
      if (availability.status !== "available") {
        return failure("WEB_SEARCH_UNAVAILABLE", availability.reason, { availability });
      }
      const parsed = parseWebSearchInput(input);
      if (!parsed.ok) {
        return failure("WEB_SEARCH_INPUT_INVALID", "Web search input is invalid", parsed.diagnostics);
      }
      const fetchedAt = (options.now?.() ?? new Date()).toISOString();
      try {
        const response = await options.backend!.search({
          ...parsed.input,
          fetchedAt,
          ...(context.signal ? { signal: context.signal } : {})
        });
        if (context.signal?.aborted) {
          return cancelledResult(providerId, parsed.input);
        }
        const filtered = applyDomainPolicy(response.results, parsed.input);
        const ranked = filtered.results.map((result, index) => ({ ...result, rank: index + 1 }));
        const normalizedResponse: WebSearchBackendResponse = {
          ...response,
          fetchedAt: response.fetchedAt || fetchedAt,
          results: ranked
        };
        return {
          ok: true,
          content: formatWebSearchResult(normalizedResponse, { maxCharacters: parsed.input.contextMaxCharacters }),
          metadata: {
            webSearch: {
              query: parsed.input.query,
              provider: normalizedResponse.provider,
              searchType: parsed.input.searchType,
              fetchedAt: normalizedResponse.fetchedAt,
              requestedMaxResults: parsed.input.maxResults,
              resultCount: normalizedResponse.results.length,
              filteredCount: filtered.filtered.length,
              allowedDomains: parsed.input.allowedDomains,
              blockedDomains: parsed.input.blockedDomains,
              sourceUrls: normalizedResponse.results.map((result) => result.url),
              ...(normalizedResponse.metadata ? { backend: sanitizeMetadata(normalizedResponse.metadata) } : {})
            }
          }
        };
      } catch (error) {
        if (context.signal?.aborted || isAbortError(error)) {
          return cancelledResult(providerId, parsed.input);
        }
        return failure("WEB_SEARCH_BACKEND_FAILED", "Web search backend failed", sanitizeError(error));
      }
    }
  };
}

function resolveToolAvailability(options: CreateWebSearchToolOptions, context: ToolAvailabilityContext): ToolAvailability {
  const policy = context.hostPolicy?.webSearch;
  if (policy === false || policy === "deny") {
    return { status: "denied-by-policy", reason: "Web search is disabled by host policy" };
  }
  if (typeof options.availability === "function") {
    return options.availability(context);
  }
  if (options.availability) {
    return options.availability;
  }
  if (!options.backend) {
    return {
      status: "missing-backend",
      reason: "Web search backend is not configured",
      metadata: { provider: options.providerId ?? "unconfigured" }
    };
  }
  return options.backend.availability?.(context) ?? { status: "available" };
}

function cancelledResult(providerId: string, input: NormalizedWebSearchInput): ToolResult {
  return failure("WEB_SEARCH_CANCELLED", "Web search was cancelled", {
    provider: providerId,
    query: input.query
  });
}

function webSearchResourceValue(input: unknown): string {
  if (!input || typeof input !== "object") {
    return "invalid";
  }
  const record = input as Record<string, unknown>;
  return JSON.stringify({
    query: typeof record.query === "string" ? record.query.trim().slice(0, 200) : "",
    providerVisible: true
  });
}

function sanitizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecretText(error.message),
      ...(hasErrorDetails(error) ? { details: sanitizeMetadata(error.details) } : {})
    };
  }
  return { message: redactSecretText(String(error)) };
}

function sanitizeMetadata(value: unknown): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return redactSecretText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/api[_-]?key|authorization|subscription[_-]?token|secret|token/i.test(key)) {
        output[key] = "[redacted]";
      } else {
        output[key] = sanitizeMetadata(entry);
      }
    }
    return output;
  }
  return undefined;
}

function redactSecretText(value: string): string {
  return value
    .replace(/(x-subscription-token\s*[:=]\s*)\S+/gi, "$1[redacted]")
    .replace(/(authorization\s*[:=]\s*)\S+/gi, "$1[redacted]")
    .replace(/(api[_-]?key\s*[:=]\s*)\S+/gi, "$1[redacted]");
}

function hasErrorDetails(error: Error): error is Error & { details: unknown } {
  return "details" in error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError") ||
    error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));
}

function failure(code: string, message: string, details?: unknown): ToolResult {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    }
  };
}
