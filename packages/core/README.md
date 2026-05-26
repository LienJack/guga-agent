# @guga-agent/core

Core kernel runtime for Guga Agent.

This package proves the smallest runtime loop:

```text
user -> model -> tool -> model -> final
```

## What The Core Includes

- Core message, provider, model metadata, tool result, usage, runtime, model event, router, and hook contracts.
- In-memory `CapabilityRegistry` for registering providers, model metadata, and tools.
- In-memory `EventBus` for observing runtime facts during tests or host integration.
- `ConversationState` for preserving assistant tool calls and matching tool results.
- Minimal `AgentLoop` for tool-calling runs through either direct mock providers or the provider router.
- `ProviderRouter` for Guga-owned model selection, retry, fallback, and observable model-call facts.
- `createAgentRuntime()` as the host-facing public entry point.
- Local trusted plugins mounted with `createAgentRuntime({ plugins })`.
- Hook contracts for runtime start, pre-tool gate, runtime shutdown, and contract-first model request/response phases.
- Mock provider and test tool fixtures for core tests.

## What The Core Does Not Include

- Real provider SDK integrations.
- AI SDK, OpenAI, Anthropic, LangChain, or provider-specific public contract types.
- Filesystem, shell, browser, git, MCP, or other real tools.
- Provider marketplace, credential pools, provider health scoring, or pricing tables.
- Plugin manifests, directory scanning, remote install, sandboxing, signing, namespaces, reload, or stale context guard.
- Full model hook execution for `model.request.before` or `model.response.after`; M2 only defines their contract shapes.
- Durable session store, replay, artifact store, or UI projection.
- Context compaction, skills, long-term memory, multi-agent orchestration, or eval infrastructure.

## Minimal Usage Shape

The host application creates a runtime, registers capabilities, subscribes to events, and runs a turn. The mock provider and test tool are exported for M0 verification only; they are not default runtime capabilities.

The public API intentionally stays small so later plugin/provider/tool phases can extend the runtime without rewriting the core loop.

## Provider Runtime Boundary

Core owns provider-neutral runtime semantics. Providers can describe available models, token usage, unknown cost state, normalized provider errors, raw metadata references, finish state, and tool intent. The agent loop consumes those through Guga contracts and `ModelEvent` facts, not provider SDK stream parts.

`ProviderRouter` owns model selection, retry, fallback, and final failure. A provider or bridge performs one selected model call at a time; it does not choose fallbacks internally.

Tool calls from a model are only tool intent. They are converted into Guga `ToolCall` values and executed through the registry plus pre-tool gate path. Provider bridges must not execute tools on their own.

Real SDK dependencies live in bridge packages such as `@guga-agent/provider-ai-sdk`, not in `@guga-agent/core`.

## Local Plugin Shape

A local plugin is a trusted TypeScript object with an `id`, `init`, and optional `shutdown`. During `init`, the plugin receives a restricted context that can register providers, tools, and hooks. It cannot mutate conversation state or execute tools directly.

```ts
import { HookEffect, HookPhase, createAgentRuntime } from "@guga-agent/core";

const plugin = {
  id: "local-example",
  init(context) {
    context.registerProvider(myProvider);
    context.registerModel({
      providerId: myProvider.id,
      modelId: "primary",
      purposes: ["primary"],
      capabilities: { toolCalling: true, usage: "optional" }
    });
    context.registerTool(myTool);
    context.registerHook({
      id: "gate-dangerous-tool",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler({ call }) {
        return call.name === "dangerous-tool"
          ? { type: "deny", reason: "blocked by local policy" }
          : { type: "allow" };
      }
    });
  },
  shutdown() {
    // Release runtime-scoped plugin state.
  }
};

const runtime = createAgentRuntime({ plugins: [plugin] });
```

Plugins initialize lazily before the first `run()`, so hosts can subscribe to `onEvent()` before plugin lifecycle and capability registration events are emitted. `dispose()` is async and returns shutdown failures before listeners and in-memory plugin state are cleared.

For tests and examples, `createExamplePlugin()` returns a single plugin that registers a mock provider, a test tool, a pre-tool gate hook, and shutdown behavior. It is not auto-loaded by plain runtimes.
