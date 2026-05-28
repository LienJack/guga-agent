# Provider AI SDK Bridge

M2 connects real model backends while keeping Guga provider semantics inside core.

## Problem

Real providers introduce stream formats, tool-call formats, usage accounting, auth paths, context-overflow errors, fallback, and SDK-specific types. If those differences leak into `packages/core`, the agent loop becomes provider-specific.

## Decision

Keep provider runtime contracts in core and place the built-in AI SDK integration under `@guga-agent/core/builtins`.

Core owns:

- model metadata;
- usage and error normalization;
- provider routing;
- model events;
- tool-intent semantics.

The bridge owns SDK-specific request/response mapping inside `packages/core/src/builtins/provider-ai-sdk/`. The legacy `@guga-agent/provider-ai-sdk` package remains only as a compatibility re-export path.

## Why This Shape

- **AI SDK is an adapter, not the architecture.** It is the default real backend path, but not the core contract.
- **Routing belongs to Guga.** Provider/model selection, fallback, and errors are runtime concerns.
- **Events stay normalized.** Streaming and non-streaming calls map back into Guga model events.
- **Tool calls return to Guga.** Provider tool intent does not bypass the tool execution pipeline.
- **Future providers remain possible.** Native OpenAI, Anthropic, gateway, or local transports can implement the same core contract.

## Current Limits

- No full provider marketplace.
- No advanced cost dashboard.
- No complete enterprise credential platform.
- Model hook execution is contract-first and grows in later modules.

## Verification

M2 is protected by provider mapper tests, router tests, normalized usage/error tests, and bridge tests that prove SDK types stay outside the core public API.
