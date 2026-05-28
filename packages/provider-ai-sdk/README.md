# @guga-agent/provider-ai-sdk

Compatibility re-export for the built-in AI SDK provider bridge.

New first-party code should import from `@guga-agent/core/builtins`.

## Boundary

The implementation lives in `packages/core/src/builtins/provider-ai-sdk/`. This package remains only to avoid breaking older imports.

The bridge performs one selected model call and maps the result back to Guga:

- Text output becomes a `final` provider response.
- AI SDK tool calls become Guga `ToolCall` intent.
- Token usage maps to Guga `Usage` with `cost.status: "unknown"` unless a later billing contract says otherwise.
- Provider exceptions map to normalized Guga provider errors.
- Tool specs passed to AI SDK omit `execute`, so tools return to the Guga registry and hook path.
- Tool availability should be filtered by the runtime before projection; this bridge only maps already-visible tool definitions into AI SDK schema-only specs.

## Usage

```ts
import { createAiSdkProviderPlugin } from "@guga-agent/core/builtins";

const plugin = createAiSdkProviderPlugin({
  id: "ai-sdk",
  mode: "openai-compatible",
  modelId: "local-model",
  baseURL: "http://localhost:11434/v1",
  apiKey: "test",
  metadata: {
    purposes: ["primary"],
    capabilities: { toolCalling: true, usage: "optional" }
  }
});
```

Supported `mode` values are `gateway`, `openai-compatible`, `openai`, and `anthropic`.

Default tests are hermetic and do not require API keys.
