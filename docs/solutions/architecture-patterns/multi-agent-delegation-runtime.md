# Multi-Agent Delegation Runtime

M14 adds Guga's first multi-agent primitive as a tool plugin.

## Problem

Multi-agent features can expand very quickly: handoffs, teams, swarm mailboxes, workflow graphs, worker pools, remote protocols, and UI timelines all look related. If all of that enters core at once, the runtime stops being small and the permission/context/session contracts become harder to trust.

Guga needs a smaller first step: let a parent agent delegate one self-contained task to an isolated child run, then receive a compact result.

## Decision

Create `@guga-agent/plugin-tools-delegation`.

The package exports:

- `createDelegateTaskTool()`
- `createDelegationPlugin()`
- `createAgentDelegationPlugin()`
- `buildDelegationInput()`
- `createDelegationLedger()`
- `renderDelegationResult()`
- `validateDelegationConfig()`
- `validateDelegationOutput()`

The model-visible tool name is `delegate_task`, matching the existing `fs_*`, `shell_exec`, and `git_*` tool naming style. The TypeScript API keeps `DelegateTask` naming because the architecture concept is "delegate task".

## Why This Shape

- **It is a normal tool.** Schema validation, permission, scheduling, hooks, result budgeting, and model-visible tool result flow all stay in the existing execution pipeline.
- **Core remains neutral.** Core does not import subagent code or know about team semantics.
- **The child runner is injected.** Hosts or profiles can decide whether the child is another `AgentRuntime`, a worker, or a test fake.
- **Context is isolated.** The child receives a generated input made from `goal`, optional `context`, agent type, and allowed tools; it does not inherit the parent transcript by default.
- **Tool inheritance is explicit.** Child tools come from an allowlist checked against a parent-visible catalog.
- **Recursive delegation is blocked by default.** Both `delegate_task` and legacy `delegateTask` names are denied in child tool allowlists.
- **The first trace contract is compact.** Parent/child run IDs, session IDs, status, tools, and event counts are preserved in metadata and ledger helpers.

## Current Limits

- No handoff that changes the active agent.
- No swarm/team/mailbox runtime.
- No background child task queue.
- No remote A2A adapter.
- No desktop timeline projection.
- No automatic worktree isolation.

## Verification

Focused gates added in this slice:

- Tool factory tests for success, invalid input, unavailable tools, recursion blocking, child failure, abort propagation, and deterministic ledgers.
- Runtime integration tests for permission/pipeline/model-visible results and headless profile filtering.
- Dependency-boundary test ensuring delegation stays out of core.
