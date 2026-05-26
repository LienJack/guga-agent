# @guga-agent/core

Core kernel runtime for Guga Agent.

This package proves the smallest runtime loop:

```text
user -> model -> tool -> model -> final
```

## What The Core Includes

- Core message, provider, tool result, usage, runtime, and event contracts.
- In-memory `CapabilityRegistry` for registering providers and tools.
- In-memory `EventBus` for observing runtime facts during tests or host integration.
- `ConversationState` for preserving assistant tool calls and matching tool results.
- Minimal `AgentLoop` for non-streaming tool-calling runs.
- `createAgentRuntime()` as the host-facing public entry point.
- Local trusted plugins mounted with `createAgentRuntime({ plugins })`.
- M1 hook support for runtime start, pre-tool gate, and runtime shutdown.
- Mock provider and test tool fixtures for core tests.

## What The Core Does Not Include

- Real provider SDK integrations.
- Filesystem, shell, browser, git, MCP, or other real tools.
- Plugin manifests, directory scanning, remote install, sandboxing, signing, namespaces, reload, or stale context guard.
- Durable session store, replay, artifact store, or UI projection.
- Context compaction, skills, long-term memory, multi-agent orchestration, or eval infrastructure.

## Minimal Usage Shape

The host application creates a runtime, registers capabilities, subscribes to events, and runs a turn. The mock provider and test tool are exported for M0 verification only; they are not default runtime capabilities.

The public API intentionally stays small so later plugin/provider/tool phases can extend the runtime without rewriting the core loop.

## Local Plugin Shape

A local plugin is a trusted TypeScript object with an `id`, `init`, and optional `shutdown`. During `init`, the plugin receives a restricted context that can register providers, tools, and hooks. It cannot mutate conversation state or execute tools directly.

```ts
import { HookEffect, HookPhase, createAgentRuntime } from "@guga-agent/core";

const plugin = {
  id: "local-example",
  init(context) {
    context.registerProvider(myProvider);
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
