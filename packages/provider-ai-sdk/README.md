# @guga-agent/provider-ai-sdk

First-party bridge from Vercel AI SDK providers into Guga's provider runtime contracts.

## Boundary

This package owns AI SDK dependency churn. `@guga-agent/core` does not import AI SDK, OpenAI, Anthropic, or OpenAI-compatible provider types.

The bridge performs one selected model call and maps the result back to Guga:

- Text output becomes a `final` provider response.
- AI SDK tool calls become Guga `ToolCall` intent.
- Token usage maps to Guga `Usage` with `cost.status: "unknown"` unless a later billing contract says otherwise.
- Provider exceptions map to normalized Guga provider errors.
- Tool specs passed to AI SDK omit `execute`, so tools return to the Guga registry and hook path.

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
