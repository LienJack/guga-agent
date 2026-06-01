# Web Search Capability

Guga adds web search as a first-party optional extension, not as a core built-in.

## Problem

Search is useful for current or external information, but a search query can contain private user context and leaves the local workspace. Search providers also return large, uneven, and sometimes stale result sets. Treating web search as a normal read-only helper would understate privacy, permission, and budgeting risks.

## Decision

Create `@guga-agent/plugin-web-search`.

The package contributes one tool, `web_search`, through `@guga-agent/extension-sdk`. The tool uses `effect: "external"`, default permission `ask`, headless/background deny, serial scheduling, renderer category `search`, and a result budget. It registers as an extension-owned capability so discovery can explain that the host opted into this network surface.

The backend is an adapter boundary:

- mock backend for hermetic tests and examples;
- Brave backend for the first real provider path, using injected `fetch` so tests verify requests without live network access;
- future hosted provider, MCP, skill, enterprise, or local search backends can normalize into the same result shape.

## Runtime Flow

```text
CLI config -> plugin-web-search -> CapabilityRegistry -> model projection
  -> ExecutionPipeline -> PermissionKernel -> web_search tool
  -> backend adapter -> formatter -> ResultPolicy -> lifecycle events
```

Unavailable configurations are represented as tool availability. When credentials are missing, model projection hides `web_search`; if a model or host calls it directly anyway, the normal execution pipeline returns a model-visible unavailable result.

## Boundaries

- No `packages/core/src/builtins` implementation.
- No arbitrary URL retrieval or page extraction in this MVP.
- No provider SDK dependency.
- No live network or API-key requirement in required tests.
- No raw provider secret in tool metadata, audit metadata, or failure details.

## Verification

The implementation is covered by:

- plugin registration and extension ownership tests;
- input, domain filter, formatter, and tool behavior tests;
- mock and Brave adapter tests with fake fetch;
- runtime integration tests for permission, projection hiding, permission denial, result budgeting, and timeout terminal events;
- CLI config and host factory tests proving default-disabled behavior and explicit opt-in registration.
