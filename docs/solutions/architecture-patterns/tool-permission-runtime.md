# Tool Permission Runtime

M3 turns model tool intent into controlled host action.

## Problem

Real tools are not ordinary functions. Filesystem, shell, and git operations can read private data, mutate the workspace, hang, emit huge output, or leave partial side effects. If every tool implements its own permission, timeout, output, and hook logic, the runtime loses control.

## Decision

Introduce a core-owned tool execution pipeline and permission kernel.

M3 owns:

- tool visibility and execution contracts;
- `ExecutionPipeline`;
- `PermissionKernel`;
- tool scheduling and timeout boundaries;
- result budgeting and references;
- first-party filesystem, shell, and git tool plugins.

## Why This Shape

- **The model expresses intent.** It never directly performs side effects.
- **Plugins contribute tools.** They do not define the safety model alone.
- **Permissions are centralized.** Allow, ask, deny, remembered decisions, and model-visible denials share one runtime path.
- **Hooks fail closed where needed.** Pre-tool gates and execution failures are observable and structured.
- **Large results are governed.** Tool output can be previewed and referenced instead of blindly appended.

## Current Limits

- No remote execution backend.
- No full sandbox product.
- No long-running job UI.
- No enterprise permission policy console.
- Durable artifact/session storage arrives in M5.

## Verification

M3 is protected by tests for permission decisions, denied tool observations, execution pipeline behavior, scheduler boundaries, result budgeting, and filesystem/shell/git plugin integration.
