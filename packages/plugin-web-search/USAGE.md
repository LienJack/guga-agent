# @guga-agent/plugin-web-search Usage

## Purpose

`@guga-agent/plugin-web-search` contributes the optional `web_search` tool. It is a search-discovery capability: it returns URLs, titles, snippets, timestamps, ranks, and audit metadata. It does not fetch arbitrary pages, render browsers, or take screenshots.

## Import

```ts
import {
  createBraveSearchBackend,
  createMockWebSearchBackend,
  createWebSearchPlugin,
  createWebSearchTool
} from "@guga-agent/plugin-web-search";
```

## Main APIs

- `createWebSearchPlugin(options)`: registers the `web_search` tool as an extension capability.
- `createWebSearchTool(options)`: creates the tool definition directly.
- Backends: `createMockWebSearchBackend()` and `createBraveSearchBackend()`.
- Input/schema helpers: `parseWebSearchInput()`, `webSearchInputSchema`, and default/max constants.
- Domain helpers: `applyDomainPolicy()`, `domainMatches()`, `hostForUrl()`, `normalizeDomainFilter()`, and `normalizeDomainFilters()`.
- Formatting: `formatWebSearchResult()`.
- Constants: `WEB_SEARCH_PACKAGE_NAME`, `WEB_SEARCH_PLUGIN_ID`, and `WEB_SEARCH_TOOL_NAME`.
- Types for backend requests/responses, permission options, input, formatted output, domain diagnostics, and provider ids.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [
    createWebSearchPlugin({
      backend: createBraveSearchBackend({
        apiKeyEnv: "BRAVE_SEARCH_API_KEY"
      })
    })
  ]
});
```

Tool input shape:

```ts
{
  query: string;
  maxResults?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  recencyDays?: number;
  searchType?: "web" | "news";
  contextMaxCharacters?: number;
}
```

## Notes

- CLI environment toggles such as `GUGA_WEB_SEARCH` are host-level configuration. This package provides the tool and backends; it does not read all host config env vars itself.
- Domain filters are enforced before and after backend calls.
- Brave backend uses an injectable fetch path so tests do not require a live API key.
- `web_fetch` is intentionally a separate future capability, not part of this package.

## Related Packages

- `@guga-agent/core` executes the tool through normal schema, hook, permission, timeout, event, and result-budget paths.
- `@guga-agent/extension-sdk` supplies extension metadata registration.
