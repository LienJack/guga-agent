# @guga-agent/provider-ai-sdk

Compatibility import path for the Guga built-in AI SDK bridge.

## Boundary

The implementation now lives in `@guga-agent/core/builtins` so the AI SDK bridge can be composed as a built-in core capability. This package re-exports the bridge API so older hosts can migrate incrementally.

The core kernel does not import AI SDK, OpenAI, Anthropic, or OpenAI-compatible provider types. AI SDK imports are isolated to the built-in bridge module and reached lazily from default composition.

The bridge performs one selected model call and maps the result back to Guga:

- Text output becomes a `final` provider response.
- AI SDK tool calls become Guga `ToolCall` intent.
- Token usage maps to Guga `Usage` with `cost.status: "unknown"` unless a later billing contract says otherwise.
- Provider exceptions map to normalized Guga provider errors.
- Tool specs passed to AI SDK omit `execute`, so tools return to the Guga registry and hook path.
- Tool availability should be filtered by the runtime before projection; this bridge only maps already-visible tool definitions into AI SDK schema-only specs.

## Usage

```ts
import { createAiSdkProviderPlugin } from "@guga-agent/provider-ai-sdk";

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

New runtime composition should prefer `@guga-agent/core/builtins`.
