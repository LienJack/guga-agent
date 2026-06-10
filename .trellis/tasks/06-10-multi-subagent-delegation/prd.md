# Implement Multi-Subagent Delegation

## Source Documents

- Requirements: `docs/brainstorms/2026-06-10-multi-subagent-delegation-handoff-coordinator-requirements.md`
- Plan: `docs/plans/2026-06-10-002-feat-multi-subagent-delegation-plan.md`

## Goal

Upgrade `@guga-agent/plugin-tools-delegation` from single child-task delegation to bounded multi-child delegation while preserving the current single-task `delegate_task` path.

## Must Have

- Support existing root `goal` single-task input and a new root `tasks` batch mode.
- Bound each batch by maximum task count and maximum concurrency, both defaulting to 3.
- Preserve child context isolation, least-privilege tool inheritance, and default recursive delegation blocking.
- Extend default child blocked capabilities to cover delegation, user clarification, memory mutation, and direct user presentation where identifiable.
- Enforce per-child timeout/cancellation in the plugin instead of merely passing timeout values to the child runner.
- Return compact, model-visible settled batch content even when some children fail, time out, or are cancelled.
- Preserve deterministic ledger/result ordering by normalized task index, not child run ID sorting.
- Split model-visible compact child metadata from audit-only raw child metadata.
- Keep core neutral: no core import of the delegation plugin, no swarm, no workflow graph, no handoff implementation.

## Implementation Plan

Follow the units in `docs/plans/2026-06-10-002-feat-multi-subagent-delegation-plan.md`:

- U1. Batch-capable delegation contracts
- U2. Bounded child-task orchestration
- U3. Batch result rendering and ledger aggregation
- U4. Tool factory and runtime integration
- U5. Documentation and P2 boundary polish

## Verification

- Hermetic unit tests for single-task compatibility, batch validation, max task count, concurrency limiting, task-index ordering, blocked capability classes, per-child timeout, cancellation, late child result handling, mixed child outcomes, and metadata visibility boundaries.
- Runtime integration tests for permission/pipeline/model-visible result flow, batch calls, headless filtering, invalid batch input, and hidden tool rejection.
- Dependency-boundary test must continue proving core does not import the delegation plugin or external orchestration frameworks.
