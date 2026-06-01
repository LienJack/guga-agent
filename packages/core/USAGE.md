# @guga-agent/core Usage

## Purpose

`@guga-agent/core` is the provider-neutral runtime kernel. It owns contracts, the agent loop, runtime facade, provider routing, capability registration, hooks, permissions, event publishing, context projection, persistence contracts, and tool execution authority.

Use this package when you are building a host, plugin, test fixture, or integration that needs to run Guga without depending on CLI, HTTP, UI, or optional ecosystem packages.

## Import

```ts
import { createAgentRuntime, HookEffect, HookPhase } from "@guga-agent/core";
import { createDefaultCoreCapabilities } from "@guga-agent/core/builtins";
```

The root entry point exposes contracts and runtime primitives. Built-in filesystem, git, shell, and AI SDK bridge helpers are exposed through `@guga-agent/core/builtins` so normal core imports do not eagerly load optional provider SDKs.

## Main APIs

- `createAgentRuntime()` and `DefaultAgentRuntime`: host-facing runtime creation and execution.
- `AgentLoop`: minimal model/tool turn loop.
- `ProviderRouter`: model selection, retry, fallback, and provider failure normalization.
- `CapabilityRegistry`: provider, model, tool, skill, hook, context-policy, store, replay, and operation discovery.
- `PluginHost` and `LocalPlugin`: trusted in-process plugin lifecycle.
- `ExecutionPipeline`, `ToolScheduler`, and `ResultPolicy`: schema validation, permission-aware tool execution, scheduling, and output budgeting.
- `PermissionKernel`: allow/ask/deny resolution for side-effecting tools.
- `HookKernel`, `HookPhase`, and `HookEffect`: lifecycle, model, context, and tool hook execution.
- Context helpers such as compaction, projection, tool-result views, reinjection, budget, pressure, and truncation services.
- Durable session, event, artifact, resume, fork, replay, and corruption contracts.
- Test fixtures such as `createMockProvider()`, `createTestTool()`, and `createExamplePlugin()`.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [myPlugin],
  builtIns: {
    capabilities: createDefaultCoreCapabilities({ workspaceRoot: process.cwd() })
  }
});

runtime.onEvent((event) => {
  console.log(event.type);
});

const result = await runtime.run({
  input: "summarize this repository",
  providerId: "mock",
  modelId: "primary"
});
```

## Parameters

- `createAgentRuntime(options)`: `options` is optional. Use `model` for a single local model plugin, `plugins` for trusted `LocalPlugin` instances, and `builtIns` to register built-in providers, models, and tools. Set `builtIns` to `false` to disable built-ins. `permissions`, `routerPolicy`, and `session` are optional runtime policy and identity defaults. `stores` and `replay` are optional persistence and replay integrations.
- `createDefaultCoreCapabilities(options)`: `options` is optional. `workspaceRoot` defaults filesystem, git, and shell tools to a workspace. Set `filesystem`, `git`, or `shell` to `false` to omit that built-in group, or pass the matching options object to customize it. `aiSdk` is optional and requires a provider `config`; `factory` is optional.
- `runtime.run(options)`: `input` is required. `providerId`, `modelId`, and `purpose` are optional routing hints. `maxTurns` limits loop iterations, `signal` cancels the run, `runId` supplies an external id, and `session` overrides the runtime session identity for that run.
- `runtime.onEvent(listener)`: `listener` is required and receives every emitted `AgentEvent`. The return value is an unsubscribe function.

## Notes

- Core does not implement CLI, HTTP, UI, MCP, skills, memory, artifact storage, replay storage, evals, or delegation as built-ins.
- Provider SDK types must not leak into public contracts, loop, registry, hooks, permissions, or execution pipeline modules.
- Model-produced tool intents must enter through the core pipeline; provider bridges should not execute tools directly.
- The exported test fixtures are useful for verification, but they are not production defaults.

## Related Packages

- `@guga-agent/extension-sdk` wraps core plugins with extension metadata.
- `@guga-agent/host-runtime` projects core runs into host resources and events.
- Plugin packages add optional stores, MCP, skills, memory, replay, eval, and operational capabilities.
