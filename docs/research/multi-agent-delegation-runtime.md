# Multi-Agent Delegation Runtime

Date: 2026-05-28

## 一句话结论

M14 should adopt the P1 design from the current multi-agent research: a single-layer `delegate_task` tool implemented as a first-party tool plugin package. It should not move multi-agent orchestration into core yet.

## Evidence

- `Fact`: `docs/research/current-multi-agent-collaboration-2026.md` compares current multi-agent projects and recommends delegate-as-tool before handoff/team/workflow/A2A.
- `Fact`: `docs/research/context-packs/multi-agent.md` shows Claude Code, Hermes, and DeerFlow all constrain subagent recursion or nesting depth.
- `Fact`: `packages/core/src/contracts/tools.ts` already exposes `ToolDefinition`, `ToolResult`, `ToolExecutionContext`, tool effect, permission metadata, scheduler metadata, and runtime metadata.
- `Fact`: `packages/core/src/contracts/runtime.ts` already exposes `AgentRuntime.run()` with `input`, `maxTurns`, `runId`, session identity, and abort signal.
- `Inference`: A first-party package can express the P1 delegation contract without changing core event unions. Child event fan-in can be represented in tool metadata first; later core events can be added when host surfaces need live progress.

## Project Comparison

| Project family | Pattern | M14 judgment |
|---|---|---|
| OpenAI Agents SDK | Agent-as-tool vs handoff | Adopt agent-as-tool semantics first |
| DeerFlow | Single-layer task tool with isolated prompt | Adopt for context boundary |
| Hermes | Toolset intersection and blocked delegate recursion | Adopt for safety |
| Claude Code | Coordinator/swarm/mailbox | Defer until Guga has stronger host surfaces |
| LangGraph/Mastra | Workflow graph | Defer; do not replace Guga runtime loop |
| A2A | Remote agent card/protocol | Defer as plugin adapter |

## Guga Landing

Create `packages/plugin-tools-delegation` with exports:

- `createDelegateTaskTool(options)` / `createDelegationPlugin(options)`
- `buildDelegationInput(input, context)`
- `createDelegationLedger(...)`
- `renderDelegationResult(...)`
- `validateDelegationConfig(...)`

The package should depend on `@guga-agent/core` types and implement the tool as a normal `ToolDefinition`. The caller injects the child runner, which keeps the MVP hermetic and avoids coupling to one runtime factory. Future host/profile packages can pass `runtime.run()` or a scoped runtime factory.

## Adopt

- Single model-visible tool entry point: `delegate_task`.
- Child input is self-contained and compact.
- Child toolset is a filtered subset of parent-visible tools.
- Child cannot receive delegation tools by default.
- Parent receives a compact result and correlation metadata.

## Adapt

- Core child-agent events are deferred. M14 stores correlation in tool metadata and a ledger that host adapters can later translate into event projections.
- Child runtime creation is injected instead of owned by the package. This avoids circular ownership between plugin packages and `AgentRuntime`.

## Skip

- Handoff/team/swarm semantics.
- Dynamic worker creation.
- Group-chat shared transcript.
- Remote A2A transport.

## Risks

- If the package accepts arbitrary tool names without a catalog, the child can appear to have tools it cannot actually use.
- If child input includes full parent transcript by default, the feature breaks the context isolation lesson from DeerFlow/Hermes.
- If recursion is not blocked, a simple task tool can become an unbounded tree of agent runs.
