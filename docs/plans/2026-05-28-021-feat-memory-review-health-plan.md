# M24 Memory Review Health Plan

Date: 2026-05-28

## Scope

Add a deterministic health summary and compact Markdown block for `MemoryReviewReport`.

## Units

- U1: planning artifacts and Trellis context.
- U2: health status type, summary function, and renderer.
- U3: behavior tests for healthy, needs-review, blocked, and rendering.
- U4: focused gates and implementation commit.
- U5: solution, blog, index, full gates, and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-candidates test`
- `pnpm --filter @guga-agent/plugin-memory-candidates typecheck`
- `pnpm --filter @guga-agent/plugin-memory-candidates build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
