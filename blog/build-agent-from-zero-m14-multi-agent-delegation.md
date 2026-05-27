# Build Agent From Zero: M14 Multi-Agent Delegation

M14 adds the first multi-agent move.

Not a swarm. Not a miniature software company. Not a graph engine hiding inside core.

Just one tool: `delegate_task`.

## The Problem

Once a single agent can read files, run commands, preserve sessions, research, write, and review, the next temptation is obvious: make many of them.

But "many agents" is not one feature. It can mean:

- a parent agent using a child as a tool;
- a handoff where another agent takes over the conversation;
- a team sharing a message bus;
- a workflow graph;
- a remote agent protocol;
- a worker pool with queues and retries.

Those are different systems. Starting with all of them would blur the contracts Guga has been protecting since M0: small core, tools through the pipeline, context as projection, events as facts, permissions at runtime.

## The Move

M14 introduces `@guga-agent/plugin-tools-delegation`.

It registers a normal model-visible tool:

```text
delegate_task
```

The TypeScript entry point is:

```ts
createDelegateTaskTool()
```

That split is intentional. Tool names follow the existing runtime style: `fs_read`, `shell_exec`, `git_status`. Code APIs can keep the domain phrase: delegate task.

## Why A Tool

A delegated task is still an action proposed by the model.

So it should pass through the same path as every other action:

```text
model tool call
-> schema validation
-> permission
-> scheduler
-> tool execution
-> result budgeting
-> tool result back to model
```

That is the main architectural point of M14. Multi-agent does not get a shortcut around the runtime.

## Child Isolation

The child does not receive the parent's full transcript.

It receives a compact generated input:

```text
Agent type
Goal
Context
Allowed tools
```

This mirrors the lesson from DeerFlow and Hermes: a child task should be self-contained. If the parent dumps the whole conversation into every child, delegation becomes expensive, noisy, and hard to audit.

## Tool Inheritance

The child can only receive tools from an allowlist checked against a parent-visible catalog.

That gives the parent a simple rule:

```text
child tools = explicit allowlist intersect parent-known tools
```

And one more rule:

```text
delegate_task is blocked by default
```

That prevents accidental recursive agent trees. Swarm can come later, but recursion should never happen by surprise.

## The Backend Boundary

The plugin does not create a real child runtime by itself.

Instead, it accepts an injected child runner. In tests, that runner is a fake. In a host, it can be another `AgentRuntime`, a worker, or a profile-specific executor.

That keeps the first slice small:

- the tool contract is real;
- permission and runtime integration are real;
- the child execution backend remains replaceable.

## What The Parent Gets Back

The parent receives a compact result:

- status;
- summary;
- child run ID;
- child session ID;
- event counts;
- metadata.

It does not receive the child's entire event stream as prompt text. That event stream belongs in host projections and audit views, not in the parent model input by default.

## What Comes Later

M14 does not implement handoff, teams, mailbox state, background child queues, A2A, or desktop timelines.

Those are real future modules. The point of this one is narrower: Guga can now represent delegation without making core a multi-agent framework.

That is enough for the next layer to stand on.
