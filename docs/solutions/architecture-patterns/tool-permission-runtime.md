# Tool Permission Runtime

M3 turns model tool intent into controlled host action. The Action OS upgrade extends that boundary so tools also carry governance metadata, intent, environment requirements, evidence views, and eval expectations.

## Problem

Real tools are not ordinary functions. Filesystem, shell, and git operations can read private data, mutate the workspace, hang, emit huge output, or leave partial side effects. If every tool implements its own permission, timeout, output, and hook logic, the runtime loses control.

## Decision

Introduce a core-owned tool execution pipeline and permission kernel.

M3 owns:

- tool visibility and execution contracts;
- ToolView and capability-lease projection;
- `ExecutionPipeline`;
- `PermissionKernel`;
- public `ToolIntent` construction from tool metadata and call facts;
- credential, sandbox, backend, and availability checks;
- tool scheduling and timeout boundaries;
- result budgeting, references, evidence metadata, redaction, and verifier state;
- first-party filesystem, shell, and git tool plugins.

## Why This Shape

- **The model expresses intent.** It never directly performs side effects.
- **Provider schemas are compiled views.** The canonical tool descriptor stays in the runtime; providers only receive the per-turn projected ToolView.
- **Plugins contribute tools.** They do not define the safety model alone.
- **Permissions are centralized.** Allow, ask, deny, remembered decisions, and model-visible denials share one runtime path.
- **Environment gates fail closed.** Declared credential, sandbox, or backend requirements are checked at projection time and again during execution.
- **Hooks fail closed where needed.** Pre-tool gates and execution failures are observable and structured.
- **Large results are governed.** Tool output can be previewed and referenced instead of blindly appended.
- **Tool results are evidence.** Raw source, model preview, UI projection, audit metadata, redaction state, and verifier state remain separate.
- **Multi-source tools use one language.** Built-ins, plugins, MCP tools, host tools, and delegation expose source/trust/action/risk/eval metadata through the same runtime contracts.

## Action OS Contracts

Action OS metadata is optional and backward compatible with `ToolEffect`, but governed tools should declare:

- `runtime.action` for action category, risk, effects, and selection tags;
- `runtime.source` for core/plugin/MCP/host/test origin and trust context;
- `runtime.permission` for default/profile behavior and prompt scope;
- `runtime.credentials`, `runtime.sandbox`, or `runtime.environment` when execution requires external capabilities;
- `runtime.resultBudget` plus evidence metadata for large or audit-sensitive outputs;
- `runtime.eval` for expected use cases, unsafe use cases, covered risks, and audit requirements.

`ExecutionPipeline` remains the authority path. `ToolIntent` is public audit metadata built from the tool descriptor, call input summary, resource scopes, lease, correlation, and environment facts. It must not contain hidden reasoning or secret values.

## Current Limits

- No remote execution backend.
- No full sandbox product.
- No credential broker or OAuth refresh product.
- No long-running job UI.
- No enterprise permission policy console.
- No model benchmark harness for tool-selection precision/recall.
- Action OS metadata enables host UI and policy integrations, but this document does not prescribe their rendering.

## Verification

M3 and Action OS are protected by tests for permission decisions, denied tool observations, ToolView projection, ToolIntent propagation, environment checks, scheduler boundaries, result budgeting/evidence views, MCP/delegation metadata, and filesystem/shell/git/plugin integration.

`@guga-agent/eval-fixtures` adds hermetic `tool-action` fixtures so expected tool calls, forbidden unsafe calls, lifecycle events, and intent metadata are visible regressions without relying on external services.
