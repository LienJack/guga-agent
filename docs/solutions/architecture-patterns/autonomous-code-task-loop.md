---
title: Autonomous code task loop
status: active
date: 2026-05-29
---

# Autonomous code task loop

## Decision

Autonomous coding is a profile/host task controller layered over the existing Guga runtime. It is not a second `AgentLoop`.

The controller owns task lifecycle, stage prompts, verification attempts, repair budget and completion evidence. Each scout, plan, execute and repair step still runs through normal `AgentRuntime.run()`, and every controller-originated verification command goes through `AgentRuntime.invokeTool()`, which reuses the existing `ExecutionPipeline`, permission kernel, hooks, result policy and durable tool events.

## Lifecycle

Task states are explicit:

```text
created -> scouting -> planning -> executing -> verifying
verifying -> completed | repairing | blocked | failed | cancelled
repairing -> executing | verifying | blocked | failed | cancelled
```

`completed` is evidence-backed. A task cannot be completed unless at least one required verification attempt has passed and the completion evidence references that passing attempt.

## Protocol

Host clients observe task state through typed protocol events and resources:

- `task.created`
- `task.phase_changed`
- `verification.started`
- `verification.completed`
- `task.completed`
- `task.blocked`
- `task.failed`
- `task.cancelled`

CLI and future desktop/IDE clients must consume these events/resources instead of parsing assistant prose.

## Verification

Verification attempts normalize command, cwd, required/optional status, exit code, summarized output and artifact reference. The default runner executes selected commands by invoking `shell_exec` through the runtime tool invoker. It does not call `child_process` directly.

Safe automatic verification may allow low-risk commands such as `pnpm --filter <pkg> test`, `pnpm typecheck`, `npm test`, `yarn lint` or `bun test`, but destructive shell commands remain denied by the code-agent permission policy.

## Compaction

Active task context must be re-injected after compaction. The reinjection source includes objective, state, attempt, plan summary, planned files/checks, recent failed required verification and the next step.

This prevents a long task from losing its completion contract after context compression.

## Reference Grounding

- Pi-style harnesses demonstrate that phase orchestration can sit above a low-level agent loop without replacing it.
- Claude Code-style tool execution confirms permission and hook pipelines must remain the hard boundary.
- OpenCode-style server events support keeping UI clients as projections of typed host state.

## Non-goals

- No mandatory `guga code` entry point.
- No controller-owned tool execution bypass.
- No core coding-specific state machine.
- No completion based only on an assistant final answer.
