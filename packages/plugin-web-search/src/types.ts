import type { PermissionAction, ToolAvailability, ToolAvailabilityContext, ToolResultBudget } from "@guga-agent/core";

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const WEB_SEARCH_PLUGIN_ID = "guga-web-search";
export const WEB_SEARCH_PACKAGE_NAME = "@guga-agent/plugin-web-search";

export type WebSearchProviderId = "mock" | "brave" | (string & {});
export type WebSearchType = "web" | "news";

export type WebSearchInput = {
  query: string;
  maxResults?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  recencyDays?: number;
  searchType?: WebSearchType;
  contextMaxCharacters?: number;
};

export type NormalizedWebSearchInput = {
  query: string;
  maxResults: number;
  allowedDomains: string[];
  blockedDomains: string[];
  searchType: WebSearchType;
  contextMaxCharacters: number;
  recencyDays?: number;
};

export type WebSearchValidationDiagnostic = {
  code: string;
  message: string;
  path?: string;
};

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  fetchedAt: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
};

export type WebSearchBackendRequest = NormalizedWebSearchInput & {
  fetchedAt: string;
  signal?: AbortSignal;
};

export type WebSearchBackendResponse = {
  query: string;
  provider: WebSearchProviderId;
  fetchedAt: string;
  results: WebSearchResultItem[];
  metadata?: Record<string, unknown>;
};

export type WebSearchBackend = {
  id: WebSearchProviderId;
  label?: string;
  availability?: (context: ToolAvailabilityContext) => ToolAvailability;
  search(request: WebSearchBackendRequest): Promise<WebSearchBackendResponse> | WebSearchBackendResponse;
};

export type WebSearchPermissionOptions = {
  defaultAction?: PermissionAction;
  trustedSessionAction?: PermissionAction;
};

export type CreateWebSearchToolOptions = {
  backend?: WebSearchBackend;
  providerId?: WebSearchProviderId;
  availability?: ToolAvailability | ((context: ToolAvailabilityContext) => ToolAvailability);
  permission?: WebSearchPermissionOptions;
  timeoutMs?: number;
  resultBudget?: ToolResultBudget;
  now?: () => Date;
};

export type WebSearchPluginOptions = CreateWebSearchToolOptions & {
  pluginId?: string;
};

export type WebSearchFormatOptions = {
  maxCharacters?: number;
};

export type DomainFilterResult = {
  results: WebSearchResultItem[];
  filtered: WebSearchResultItem[];
};
