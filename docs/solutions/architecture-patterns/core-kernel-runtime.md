# Core Kernel Runtime

M0 proves the smallest useful Guga runtime: a host can run a provider/tool loop without any product shell.

## Problem

Agent projects often start by wiring a real provider, CLI, tools, and persistence all at once. That creates a demo quickly, but it hides the basic runtime questions:

- What is the provider contract?
- How do tool calls and tool results stay paired?
- How does a host observe a run?
- What happens when a provider or tool is missing?
- Can the core run without CLI, UI, or external services?

## Decision

Create `@guga-agent/core` as the first package.

M0 owns:

- normalized core contracts;
- `CapabilityRegistry`;
- `ConversationState`;
- `EventBus`;
- `AgentLoop`;
- `AgentRuntime`;
- mock provider and test tool helpers.

The first proof is a mock-driven loop:

```text
user -> model -> tool -> model -> final
```

## Why This Shape

- **Core stays host-neutral.** No CLI, web, IDE, worker, or server assumption enters the kernel.
- **Provider SDKs stay outside.** Core types do not leak OpenAI, Anthropic, AI SDK, or other vendor types.
- **Tool failures are model-visible.** A failed tool call becomes structured observation instead of an untyped crash.
- **Events start early.** Later UI, replay, audit, and eval surfaces all need runtime facts from the beginning.
- **Tests are hermetic.** Mock provider and test tool prove behavior without credentials or network.

## Current Limits

- No plugin host.
- No real provider bridge.
- No real filesystem/shell/git tools.
- No permissions.
- No context compaction.
- No durable session store or replay.

## Verification

M0 is protected by core tests for successful tool-calling, structured tool failure, missing capability errors, provider contract boundaries, event publication, and conversation pairing.
