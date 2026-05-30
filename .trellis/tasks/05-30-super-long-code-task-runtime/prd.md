# Super-long Code Task Runtime Hardening

## Goal

Implement the first executable slice of `docs/plans/2026-05-30-001-feat-super-long-code-task-runtime-plan.md`.

## Scope

- Add a code-task plan ledger contract with evidence-based settlement.
- Parse structured planner output into ledger-bearing plans.
- Persist typed task and verification host facts to the durable `EventStore` lane.
- Add canonical recovery outcomes to core resume/replay.
- Project ledger progress through Host resources, CLI workbench state, and task reinjection.
- Document the ownership boundaries in package READMEs.

## Non-Goals

- No branch/fork/tree UX.
- No subagent sidechains.
- No rich server dashboard beyond existing Host/CLI projection.
- No automatic git commit or destructive workspace behavior.

## Verification

- `pnpm --filter @guga-agent/profile-code-agent test -- --runInBand`
- `pnpm --filter @guga-agent/host-runtime test -- --runInBand`
- `pnpm --filter @guga-agent/plugin-session-jsonl test -- --runInBand`
- `pnpm --filter @guga-agent/cli test -- --runInBand`
- `pnpm --filter @guga-agent/core typecheck`
- `pnpm --filter @guga-agent/cli typecheck`
