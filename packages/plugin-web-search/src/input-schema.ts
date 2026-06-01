import type { NormalizedWebSearchInput, WebSearchInput, WebSearchType, WebSearchValidationDiagnostic } from "./types";
import { normalizeDomainFilters } from "./domain-policy";

export const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5;
export const MAX_WEB_SEARCH_RESULTS = 20;
export const DEFAULT_WEB_SEARCH_CONTEXT_MAX_CHARACTERS = 8_000;
export const MAX_WEB_SEARCH_CONTEXT_MAX_CHARACTERS = 20_000;
const MAX_QUERY_CHARACTERS = 400;

export const webSearchInputSchema = {
  type: "object",
  required: ["query"],
  additionalProperties: false,
  properties: {
    query: { type: "string" },
    maxResults: { type: "number" },
    allowedDomains: { type: "array", items: { type: "string" } },
    blockedDomains: { type: "array", items: { type: "string" } },
    recencyDays: { type: "number" },
    searchType: { type: "string", enum: ["web", "news"] },
    contextMaxCharacters: { type: "number" }
  }
} as const;

export function parseWebSearchInput(input: unknown): { ok: true; input: NormalizedWebSearchInput } | { ok: false; diagnostics: WebSearchValidationDiagnostic[] } {
  const diagnostics: WebSearchValidationDiagnostic[] = [];
  if (!isRecord(input)) {
    return { ok: false, diagnostics: [{ code: "WEB_SEARCH_INPUT_NOT_OBJECT", message: "Web search input must be an object" }] };
  }

  const query = input.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    diagnostics.push({ code: "WEB_SEARCH_QUERY_REQUIRED", message: "Web search query must be a non-empty string", path: "query" });
  } else if (query.trim().length > MAX_QUERY_CHARACTERS) {
    diagnostics.push({ code: "WEB_SEARCH_QUERY_TOO_LONG", message: `Web search query must be ${MAX_QUERY_CHARACTERS} characters or fewer`, path: "query" });
  }

  const maxResults = parsePositiveInteger(input.maxResults, "maxResults", DEFAULT_WEB_SEARCH_MAX_RESULTS, 1, MAX_WEB_SEARCH_RESULTS, diagnostics);
  const contextMaxCharacters = parsePositiveInteger(
    input.contextMaxCharacters,
    "contextMaxCharacters",
    DEFAULT_WEB_SEARCH_CONTEXT_MAX_CHARACTERS,
    1,
    MAX_WEB_SEARCH_CONTEXT_MAX_CHARACTERS,
    diagnostics
  );
  const recencyDays = parseOptionalPositiveInteger(input.recencyDays, "recencyDays", 1, 365, diagnostics);
  const searchType = parseSearchType(input.searchType, diagnostics);
  const allowedDomains = normalizeDomainList(input.allowedDomains, "allowedDomains", diagnostics);
  const blockedDomains = normalizeDomainList(input.blockedDomains, "blockedDomains", diagnostics);

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    input: {
      query: (query as string).trim(),
      maxResults,
      allowedDomains,
      blockedDomains,
      searchType,
      contextMaxCharacters,
      ...(recencyDays !== undefined ? { recencyDays } : {})
    }
  };
}

function parsePositiveInteger(
  value: unknown,
  path: keyof WebSearchInput,
  fallback: number,
  min: number,
  max: number,
  diagnostics: WebSearchValidationDiagnostic[]
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    diagnostics.push({ code: "WEB_SEARCH_NUMBER_OUT_OF_RANGE", message: `${path} must be an integer from ${min} to ${max}`, path });
    return fallback;
  }
  return value;
}

function parseOptionalPositiveInteger(
  value: unknown,
  path: keyof WebSearchInput,
  min: number,
  max: number,
  diagnostics: WebSearchValidationDiagnostic[]
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    diagnostics.push({ code: "WEB_SEARCH_NUMBER_OUT_OF_RANGE", message: `${path} must be an integer from ${min} to ${max}`, path });
    return undefined;
  }
  return value;
}

function parseSearchType(value: unknown, diagnostics: WebSearchValidationDiagnostic[]): WebSearchType {
  if (value === undefined) {
    return "web";
  }
  if (value === "web" || value === "news") {
    return value;
  }
  diagnostics.push({ code: "WEB_SEARCH_TYPE_INVALID", message: "searchType must be web or news", path: "searchType" });
  return "web";
}

function normalizeDomainList(
  value: unknown,
  path: "allowedDomains" | "blockedDomains",
  diagnostics: WebSearchValidationDiagnostic[]
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "WEB_SEARCH_DOMAIN_FILTER_INVALID", message: `${path} must be an array of domain strings`, path });
    return [];
  }
  if (value.some((item) => typeof item !== "string")) {
    diagnostics.push({ code: "WEB_SEARCH_DOMAIN_FILTER_INVALID", message: `${path} must contain only strings`, path });
    return [];
  }
  const normalized = normalizeDomainFilters(value as string[]);
  if (!normalized.ok) {
    diagnostics.push(...normalized.diagnostics.map((diagnostic) => ({ ...diagnostic, path })));
    return [];
  }
  return normalized.domains;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
