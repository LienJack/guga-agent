# @guga-agent/profile-code-agent

First-party coding-agent profile for Guga.

The profile composes existing runtime capabilities into a coding workflow bundle. It does not own execution flow and does not bypass the permission runtime.

Filesystem, shell, and git tools are composed through `@guga-agent/core/builtins` in `createCodeAgentRuntimeOptions()`. Optional integrations such as skills, MCP, ops health, audit export, and eval remain separate plugins/extensions through `createCodeAgentPlugins()`.

## Autonomous Task Loop

The code profile exposes autonomous task contracts for natural coding prompts. A task controller can classify implementation prompts, run scout/plan/execute/repair stages through ordinary runtime runs, and gate completion on required verification attempts.

Planner output is ingested through a small structured `code_task_plan` JSON block. Summary-only planner prose is not enough to begin long-task execution: the plan must produce ledger items with stable IDs, changed-file intent, checks, risks, and assumptions.

`CodeTaskPlan.ledgerItems` is the profile-owned settlement contract for long coding tasks. Items move through `pending -> in-progress -> evidence-submitted -> verified -> done` or `blocked`, and completed tasks require every ledger item to be verified or done. Evidence is stored as references to durable events, tool results, artifacts, diffs, verification attempts, or user confirmations rather than copied blobs.

Verification uses the runtime tool invoker rather than direct shell execution, so permission, hooks, timeout, result budgeting and durable tool events remain intact. A task reaches `completed` only when completion evidence references a passing required verification attempt.

Compaction/recovery can use `createCodeTaskReinjectionSource()` to re-inject the active objective, ledger progress, current evidence, changed files, failed verification and next step.

The profile is not an extension authoring template. New optional runtime capabilities should use `@guga-agent/extension-sdk`.
