# M14 Multi-Agent Delegation Runtime Plan

## Objective

Build the first multi-agent delegation slice as a first-party tool package that exposes a hermetic `delegate_task` tool, a `createDelegateTaskTool()` factory, ledger helpers, validation, and tests.

## Scope Boundaries

- Implement delegation as a tool/package, not a core loop change.
- Keep all tests hermetic with injected child runners.
- Do not implement handoff, teams, swarm, background queues, remote A2A, or desktop UI.

## Implementation Units

### U1 — Package Scaffold

Files:

- Create `packages/plugin-tools-delegation/package.json`
- Create `packages/plugin-tools-delegation/tsconfig.json`
- Create `packages/plugin-tools-delegation/src/index.ts`

Verification:

- Package is included in pnpm workspace automatically by `packages/*`.
- Package exports compile under TypeScript.

### U2 — Delegation Types And Ledger

Files:

- Create `packages/plugin-tools-delegation/src/delegation-types.ts`
- Create `packages/plugin-tools-delegation/src/delegation-ledger.ts`

Behavior:

- Define `DelegateTaskInput`, `DelegateTaskOutput`, `DelegationAgentType`, `DelegationStatus`, `DelegationRunRecord`, and `DelegationLedger`.
- Normalize and sort event counts deterministically.
- Provide validators for configuration and result shape.

Verification:

- Unit tests cover valid/invalid inputs, recursion blocking, unavailable tools, and deterministic ledger ordering.

### U3 — Delegate Tool Factory

Files:

- Create `packages/plugin-tools-delegation/src/delegate-task-tool.ts`

Behavior:

- `createDelegateTaskTool(options)` returns a `ToolDefinition`.
- Tool validates input, filters tool allowlist against a parent-visible catalog, blocks delegation tools by default, applies default max turns and timeout, and calls the injected child runner.
- Tool returns a compact success/failure payload for the parent plus metadata with parent/child correlation.

Verification:

- Tests cover success, child failure, invalid input, unavailable allowlist, blocked recursion, maxTurns/timeout defaults, and abort signal propagation.

### U4 — Docs And Article

Files:

- Create `docs/solutions/architecture-patterns/multi-agent-delegation-runtime.md`
- Create `blog/build-agent-from-zero-m14-multi-agent-delegation.md`
- Update `docs/research/index.md`

Verification:

- Article explains why M14 is delegate-as-tool rather than swarm.

## Test Commands

- `pnpm --filter @guga-agent/plugin-tools-delegation test`
- `pnpm --filter @guga-agent/plugin-tools-delegation typecheck`
- `pnpm --filter @guga-agent/plugin-tools-delegation build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`

## Completion

- Trellis validate/archive passes.
- M14 commits are scoped and do not stage unrelated roadmap/research doc moves.
