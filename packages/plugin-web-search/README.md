# @guga-agent/plugin-web-search

First-party optional extension that contributes the model-visible `web_search` tool.

`web_search` is search discovery only. It returns source URLs, titles, snippets, ranks, fetched timestamps, and provider metadata. It does not fetch arbitrary pages, render browser state, take screenshots, or use provider-hosted citations as a substitute for Guga source metadata.

## Configuration

CLI hosts keep web search disabled by default.

```json
{
  "webSearch": {
    "enabled": true,
    "provider": "brave",
    "apiKeyEnv": "BRAVE_SEARCH_API_KEY",
    "permission": {
      "defaultAction": "ask",
      "trustedSessionAction": "allow"
    }
  }
}
```

Environment overrides are available for local smoke runs:

```sh
GUGA_WEB_SEARCH=true
GUGA_WEB_SEARCH_PROVIDER=mock
GUGA_WEB_SEARCH_PERMISSION=allow
```

Supported MVP providers:

- `mock`: hermetic deterministic backend for tests, examples, and local smoke.
- `brave`: Brave Web Search API backend using `https://api.search.brave.com/res/v1/web/search` and `X-Subscription-Token` authentication. The adapter is fake-fetch testable and does not require a live API key in CI.

## Permissions

The tool has `effect: "external"` because the query leaves the local workspace. Runtime metadata defaults to:

- default profile: `ask`;
- headless/background profiles: `deny`;
- trusted session: configurable, commonly `allow` only when the host explicitly opted in.

All calls still go through Guga schema validation, availability checks, hooks, `PermissionKernel`, timeout/abort handling, result budgeting, and tool lifecycle events.

## Input

```ts
{
  query: string;
  maxResults?: number;          // 1..20, default 5
  allowedDomains?: string[];    // exact host or parent domain
  blockedDomains?: string[];
  recencyDays?: number;         // 1..365
  searchType?: "web" | "news";  // MVP normalizes the field; Brave uses web search
  contextMaxCharacters?: number;
}
```

Domain filters are validated before the backend runs. The tool layer enforces filters even when a provider also supports site operators.

## Output

The model-visible content is compact text with numbered results:

```text
1. Example title
URL: https://example.com/page
Snippet: Example snippet
Fetched: 2026-06-01T00:00:00.000Z
Published: 2026-05-31
```

`ToolResult.metadata.webSearch` keeps audit data: provider id, query, result count, filtered count, domain filters, fetched timestamp, and source URLs. Secret-bearing provider errors are redacted before they enter metadata.

## Future Work

- `web_fetch` should be a separate tool with URL/IP safety, content-type handling, HTML-to-text conversion, and fetch-specific result budgets.
- Provider-hosted search can become a backend once provider bridge surfaces are ready, but it should not replace Guga-owned source metadata.
- MCP/skill search providers can be bridged later without changing the first-party `web_search` contract.
