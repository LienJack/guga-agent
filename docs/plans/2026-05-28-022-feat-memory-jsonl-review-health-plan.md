# M25 Memory JSONL Review Health Plan

Date: 2026-05-28

## Scope

Add a read-only `JsonlMemoryStore` helper that returns memory health from durable JSONL records.

## Units

- U1: planning artifacts and Trellis context.
- U2: `readReviewHealth()` result type and implementation.
- U3: behavior tests for healthy, needs-review, partial-tail, and corrupt records.
- U4: focused gates and implementation commit.
- U5: solution, blog, index, full gates, and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-jsonl test`
- `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
- `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
