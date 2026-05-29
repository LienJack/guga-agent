# @guga-agent/profile-code-agent

First-party coding-agent profile for Guga.

The profile composes existing runtime capabilities into a coding workflow bundle. It does not own execution flow and does not bypass the permission runtime.

Filesystem, shell, and git tools are composed through `@guga-agent/core/builtins` in `createCodeAgentRuntimeOptions()`. Optional integrations such as skills, MCP, ops health, audit export, and eval remain separate plugins/extensions through `createCodeAgentPlugins()`.

## Autonomous Task Loop

The code profile exposes autonomous task contracts for natural coding prompts. A task controller can classify implementation prompts, run scout/plan/execute/repair stages through ordinary runtime runs, and gate completion on required verification attempts.

Verification uses the runtime tool invoker rather than direct shell execution, so permission, hooks, timeout, result budgeting and durable tool events remain intact. A task reaches `completed` only when completion evidence references a passing required verification attempt.

Compaction/recovery can use `createCodeTaskReinjectionSource()` to re-inject the active objective, plan, failed verification and next step.

The profile is not an extension authoring template. New optional runtime capabilities should use `@guga-agent/extension-sdk`.
