# M22 Memory JSONL Review Report Plan

Date: 2026-05-28

## Scope

Add a read-only `JsonlMemoryStore` helper that returns the M20 memory review report from durable JSONL records.

## Units

- U1: planning artifacts and Trellis context.
- U2: `readReviewReport()` result type and implementation.
- U3: behavior tests for success, partial-tail, and corrupt records.
- U4: focused gates and implementation commit.
- U5: solution, blog, index, full gates, and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-jsonl test`
- `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
- `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
