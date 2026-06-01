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
- Ledger helpers: `createDelegationLedger()`, `renderDelegationResult()`, `sortEventCounts()`, and `validateDelegationOutput()`.
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

## Parameters

- `createDelegationPlugin(options)` and `createDelegateTaskTool(options)` require `childRunner`. The runner receives the normalized goal, context, selected child tools, run/session ids, parent ids, turn and timeout limits, and an optional abort `signal`; it must return a `status` and `summary`.
- Tool configuration options include `parentRunId`, `toolName`, `description`, `toolCatalog`, `defaultAgentType`, `defaultMaxTurns`, `defaultTimeoutMs`, `defaultToolAllowlist`, `blockedToolNames`, `createChildRunId`, and `createChildSessionId`. `pluginId` is available on `createDelegationPlugin(options)` only.
- `toolCatalog` lists the tools the child is allowed to request by name. `defaultToolAllowlist` and model-provided `toolAllowlist` entries must exist in `toolCatalog` and cannot include the delegation tool itself or any `blockedToolNames`.
- Model input for `delegate_task` requires `goal`. Optional fields are `context`, `agentType`, `toolAllowlist`, `maxTurns`, and `timeoutMs`; `maxTurns` and `timeoutMs` must be positive integers when present.
- `buildDelegationInput(input, agentType, tools)` expects validated input and renders the compact prompt passed to the child runner.

## Notes

- The host must provide the child runner; this package does not spawn processes or agents on its own.
- The tool prevents recursive delegation-tool calls.
- Default permission metadata treats delegation as an external effect. Headless/background profiles deny by default, while trusted sessions can allow it.
- Keep delegated tasks self-contained and pass only the context the child needs.

## Related Packages

- `@guga-agent/core` provides tool and plugin contracts.
- `@guga-agent/profile-code-agent` can use delegation concepts in higher-level coding workflows.
