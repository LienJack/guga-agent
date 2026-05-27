# @guga-agent/core

Core kernel runtime for Guga Agent.

This package owns the provider-neutral runtime loop:

```text
provider tool intent -> core pipeline -> hooks -> permission -> tool -> result policy -> model observation
```

## What The Core Includes

- Core message, provider, model metadata, tool runtime, permission, result budget, usage, runtime, model event, router, and hook contracts.
- Durable session, event, artifact, resume, fork, and replay contracts. Concrete storage remains in plugin packages.
- In-memory `CapabilityRegistry` for registering providers, model metadata, and tools.
- Serializable capability discovery descriptors for providers, models, tools, skills, hooks, context policies, stores, and replay capabilities.
- In-memory `EventBus` for observing runtime facts during tests or host integration, plus an optional durable append/publish lane for recovery-sensitive facts.
- `ConversationState` for preserving assistant tool calls and matching tool results.
- Minimal `AgentLoop` for tool-calling runs through either direct mock providers or the provider router.
- `ProviderRouter` for Guga-owned model selection, retry, fallback, and observable model-call facts.
- `createAgentRuntime()` as the host-facing public entry point.
- Local trusted plugins mounted with `createAgentRuntime({ plugins })`.
- `ExecutionPipeline`, `PermissionKernel`, `ToolScheduler`, `ResultPolicy`, and lifecycle events for auditable tool execution.
- Hook contracts for runtime start, pre-tool gate compatibility, tool call/execute/result phases, runtime shutdown, and contract-first model request/response phases.
- Mock provider and test tool fixtures for core tests.

## What The Core Does Not Include

- Real provider SDK integrations.
- AI SDK, OpenAI, Anthropic, LangChain, or provider-specific public contract types.
- Filesystem, shell, browser, git, MCP, or other real tools.
- Provider marketplace, credential pools, provider health scoring, or pricing tables.
- Plugin manifests, directory scanning, remote install, sandboxing, signing, namespaces, reload, or stale context guard.
- Full host UI permission dialogs, durable result stores, enterprise policy engines, or remote sandbox backends.
- Concrete durable session store, replay plugin, artifact store implementation, or UI projection.
- Context compaction, skills, long-term memory, multi-agent orchestration, or eval infrastructure.

## Capability Discovery Boundary

Core records capability ownership and source metadata while keeping concrete implementations outside the kernel. Hosts can call `listCapabilityDescriptors()` on the runtime or registry to inspect serializable descriptors such as:

- `type`: provider, model, tool, skill, hook, context-policy, store, or replay.
- `name`: the stable runtime identifier.
- `source`: host, plugin, MCP, built-in, or test source.
- `ownerPluginId`: the plugin that contributed the capability when applicable.
- `namespace`: a stable grouping such as an MCP server name or skill namespace.

`diffCapabilityDescriptors(before, after)` provides a small host-facing primitive for explaining added, removed, changed, and conflict-skipped capabilities. Concrete skills and MCP behavior live in first-party plugins such as `@guga-agent/plugin-skills` and `@guga-agent/plugin-mcp`.

## Minimal Usage Shape

The host application creates a runtime, registers capabilities, subscribes to events, and runs a turn. The mock provider and test tool are exported for M0 verification only; they are not default runtime capabilities.

The public API intentionally stays small so later plugin/provider/tool phases can extend the runtime without rewriting the core loop.

## Provider Runtime Boundary

Core owns provider-neutral runtime semantics. Providers can describe available models, token usage, unknown cost state, normalized provider errors, raw metadata references, finish state, and tool intent. The agent loop consumes those through Guga contracts and `ModelEvent` facts, not provider SDK stream parts.

`ProviderRouter` owns model selection, retry, fallback, and final failure. A provider or bridge performs one selected model call at a time; it does not choose fallbacks internally.

Tool calls from a model are only tool intent. They are converted into Guga `ToolCall` values and executed through the core `ExecutionPipeline`. The pipeline performs lookup, schema checks, tool hooks, permission resolution, execution, result budgeting, and lifecycle events. Provider bridges must not execute tools on their own.

Real SDK dependencies live in bridge packages such as `@guga-agent/provider-ai-sdk`, not in `@guga-agent/core`.

## Tool Runtime Boundary

Real tools live in plugin packages such as `@guga-agent/plugin-tools-filesystem`, `@guga-agent/plugin-tools-shell`, and `@guga-agent/plugin-tools-git`. Core owns the contracts and final execution authority; first-party and custom tools enter through the same registry and pipeline.

Side-effecting tools declare permission metadata and are evaluated by `PermissionKernel` before execution. Denied, cancelled, timed-out, missing, schema-invalid, hook-blocked, and thrown tool calls become structured model-visible tool observations. Large outputs pass through `ResultPolicy` so model-visible content stays bounded while runtime metadata records budget facts.

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

## Durable Workbench Boundary

Core defines the public `EventStore`, `SessionStore`, `ArtifactStore`, and replay capability contracts. Hosts may provide stores directly through `createAgentRuntime({ stores, replay })`, or first-party and third-party plugins may register them through the same plugin context as tools and providers.

The first-party local implementations live outside core:

- `@guga-agent/plugin-session-jsonl`: append-only JSONL event/session storage.
- `@guga-agent/plugin-artifact-filesystem`: filesystem-backed artifact storage for large results.
- `@guga-agent/plugin-replay-audit`: replay views derived from durable facts.

Replay is fact-based by default. It reconstructs conversation, model-input, and audit views from durable events, provider-input committed facts, projection records, and artifact references; it does not rerun providers, tools, or mutating hooks.
