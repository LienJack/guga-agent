# Error Handling

> How errors are handled in this project.

---

## Overview

Core runtime errors must be structured and observable. Provider failures, missing capabilities, max-turn failures, and tool failures should not disappear into logs or raw thrown exceptions. Runtime failures return an `AgentRunFailure` and emit an `error` event. Tool failures become model-visible tool observations so the provider can continue the loop.

---

## Error Types

- `CoreError`: internal runtime exception class with `code`, `message`, and optional `details`.
- `AgentRunFailure`: host-facing run result with `ok: false`, `runId`, structured `error`, and the run's event slice.
- `ToolFailure`: tool result with `ok: false` and an error payload; it is converted into a `role: "tool"` message with `isError: true`.
- `AgentRuntimeShutdownResult`: host-facing async dispose result with `ok`, `runId`, `failures`, and shutdown event slice.

Current core error codes:

- `PROVIDER_NOT_FOUND`
- `TOOL_NOT_FOUND`
- `CAPABILITY_ALREADY_REGISTERED`
- `PROVIDER_FAILED`
- `MAX_TURNS_EXCEEDED`
- `PLUGIN_INIT_FAILED`
- `PLUGIN_SHUTDOWN_FAILED`
- `HOOK_FAILED`
- `RUNTIME_DISPOSED`

---

## Error Handling Patterns

- Missing provider: fail the run, emit an `error` event, and return `AgentRunFailure`.
- Missing tool: fail the run, emit an `error` event, and return `AgentRunFailure`.
- Provider throws or returns failure: normalize to `PROVIDER_FAILED`, emit an `error` event, and return `AgentRunFailure`.
- Tool returns failure or throws: convert to `ToolFailure`, append it to conversation state as a model-visible observation, emit `tool.result`, and continue the loop.
- Max turns exceeded: fail the run with `MAX_TURNS_EXCEEDED` and emit an `error` event.
- Plugin init fails: publish `plugin.failure`, return `AgentRunFailure`, and clean up any plugin capabilities already registered for that runtime.
- Pre-tool gate hook denies: do not execute the tool; append a model-visible `TOOL_CALL_BLOCKED` tool observation and emit hook decision/tool result events.
- Pre-tool gate hook throws: return `AgentRunFailure` with `HOOK_FAILED`; do not disguise this as a tool execution failure.
- Plugin shutdown or shutdown hook fails: return the failure through `AgentRuntimeShutdownResult` and publish observable failure events before clearing event listeners.
- Disposed runtime is terminal: later `run()` calls return `RUNTIME_DISPOSED`, and later manual capability registration throws `RUNTIME_DISPOSED`.

---

## API Error Responses

The runtime is a library API, not an HTTP API. Host-facing failures use this shape:

```typescript
{
  ok: false,
  runId: string,
  error: {
    code: string,
    message: string,
    details?: unknown
  },
  events: AgentEvent[]
}
```

---

## Common Mistakes

### Wrong: let provider exceptions escape the loop

If `provider.generate()` throws, the loop must convert it to a structured `PROVIDER_FAILED` run failure and emit an `error` event.

### Wrong: treat tool failure as host-only error

Tool failure must be visible to the model as a tool observation. Returning only a thrown exception prevents the provider from recovering or explaining the failure.

### Correct: return run-specific event slices

When a runtime has a long-lived in-memory `EventBus`, each `AgentRunResult.events` should include only events for that run, not historical events from previous runs.

### Correct: keep hook failure separate from tool failure

A tool exception becomes a model-visible tool observation so the provider can recover. A pre-tool hook exception is a runtime control-plane failure and must return `HOOK_FAILED`; otherwise policy or lifecycle bugs can look like ordinary tool output.
