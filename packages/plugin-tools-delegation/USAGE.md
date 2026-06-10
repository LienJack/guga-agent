# @guga-agent/plugin-tools-delegation Usage

## Purpose

`@guga-agent/plugin-tools-delegation` contributes a `delegate_task` tool shape for hosts that can run an isolated child agent. It validates delegation inputs, calls an injected child runner, records a compact ledger, and returns a bounded result to the parent run.

## Import

```ts
import {
  DEFAULT_DELEGATE_TASK_TOOL_NAME,
  createDelegationPlugin,
  createDelegateTaskTool
} from "@guga-agent/plugin-tools-delegation";
```

## Main APIs

- `createDelegationPlugin(options)`: registers the delegation tool through a runtime plugin.
- `createDelegateTaskTool(options)`: creates the tool definition directly.
- `buildDelegationInput(input)`: normalizes model-provided input.
- `validateDelegationConfig(options)`: validates child runner/tool catalog configuration.
- Ledger helpers: `createDelegationLedger()`, `renderDelegationResult()`, `renderDelegationBatchResult()`, `countDelegationStatuses()`, `mergeDelegationEventCounts()`, `sortEventCounts()`, and `validateDelegationOutput()`.
- Batch runner helper: `runDelegationBatch()` for hosts that want the same bounded child execution primitive outside the registered tool.
- Constants: `DEFAULT_DELEGATE_TASK_TOOL_NAME` and `LEGACY_DELEGATE_TASK_TOOL_NAME`.
- Types for child runners, requests, results, ledger records, event counts, status, validation diagnostics, and tool options.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [
    createDelegationPlugin({
      childRunner: async (request) => ({
        status: "completed",
        summary: `Completed: ${request.goal}`,
        events: []
      }),
      toolCatalog: []
    })
  ]
});
```

The tool accepts either a legacy single-task input:

```json
{
  "goal": "Review the API docs",
  "context": "Focus on missing examples",
  "agentType": "review",
  "toolAllowlist": ["fs_read"],
  "maxTurns": 2,
  "timeoutMs": 300000
}
```

Or a bounded batch of child tasks:

```json
{
  "tasks": [
    { "id": "docs", "goal": "Review documentation gaps", "toolAllowlist": ["fs_read"] },
    { "id": "tests", "goal": "Review missing tests", "toolAllowlist": ["fs_read"] }
  ],
  "maxConcurrency": 2
}
```

## Parameters

- `createDelegationPlugin(options)` and `createDelegateTaskTool(options)` require `childRunner`. The runner receives the normalized goal, context, selected child tools, run/session ids, parent ids, turn and timeout limits, and an optional abort `signal`; it must return a `status` and `summary`.
- Tool configuration options include `parentRunId`, `toolName`, `description`, `toolCatalog`, `resolveToolCatalog`, `defaultAgentType`, `defaultMaxTurns`, `defaultTimeoutMs`, `defaultMaxConcurrency`, `maxBatchTasks`, `maxInputChars`, `maxChildMetadataChars`, `defaultToolAllowlist`, `blockedToolNames`, `blockedCapabilities`, `createChildRunId`, and `createChildSessionId`. `pluginId` is available on `createDelegationPlugin(options)` only.
- `toolCatalog` lists the tools the child is allowed to request by name. Each catalog item can also declare blocked capability tags such as `delegation`, `user-clarification`, `memory-mutation`, and `user-presentation`.
- `defaultToolAllowlist` and model-provided `toolAllowlist` entries must exist in the current catalog and cannot include blocked tool names or blocked capabilities. The default blocklist prevents recursive delegation, user clarification, memory mutation, and direct user presentation from child agents.
- Model input for `delegate_task` is either a single root `goal` or a non-empty `tasks` array. Do not send both. Batch inputs may include `maxConcurrency`; each task carries its own `goal`, `context`, `agentType`, `toolAllowlist`, `maxTurns`, and `timeoutMs`.
- `maxTurns`, `timeoutMs`, and `maxConcurrency` must be positive integers when present. Batch size is limited by `maxBatchTasks`, which defaults to `3`.
- `buildDelegationInput(input, agentType, tools)` expects validated input and renders the compact prompt passed to the child runner.

## Notes

- The host must provide the child runner; this package does not spawn processes or agents on its own.
- The tool prevents recursive delegation-tool calls and blocks unsafe child capabilities by default.
- Single-task failures preserve the old tool-failure behavior. Batch calls return a compact successful tool result once all children settle, with per-child failed, cancelled, or timed-out statuses visible in the result content and audit metadata.
- Default permission metadata treats delegation as an external effect. Headless/background profiles deny by default, while trusted sessions can allow it.
- Keep delegated tasks self-contained and pass only the context the child needs.

## Related Packages

- `@guga-agent/core` provides tool and plugin contracts.
- `@guga-agent/profile-code-agent` can use delegation concepts in higher-level coding workflows.
