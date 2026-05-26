# @guga-agent/core

M0 core kernel runtime for Guga Agent.

This package proves the smallest runtime loop:

```text
user -> model -> tool -> model -> final
```

## What M0 Includes

- Core message, provider, tool result, usage, runtime, and event contracts.
- In-memory `CapabilityRegistry` for registering providers and tools.
- In-memory `EventBus` for observing runtime facts during tests or host integration.
- `ConversationState` for preserving assistant tool calls and matching tool results.
- Minimal `AgentLoop` for non-streaming tool-calling runs.
- `createAgentRuntime()` as the host-facing public entry point.
- Mock provider and test tool fixtures for core tests.

## What M0 Does Not Include

- Real provider SDK integrations.
- Filesystem, shell, browser, git, MCP, or other real tools.
- Plugin manifests, plugin loading, hooks, namespaces, reload, or stale context guard.
- Durable session store, replay, artifact store, or UI projection.
- Context compaction, skills, long-term memory, multi-agent orchestration, or eval infrastructure.

## Minimal Usage Shape

The host application creates a runtime, registers capabilities, subscribes to events, and runs a turn. The mock provider and test tool are exported for M0 verification only; they are not default runtime capabilities.

The public API intentionally stays small so later plugin/provider/tool phases can extend the runtime without rewriting the core loop.
