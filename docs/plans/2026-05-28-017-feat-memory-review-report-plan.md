# M20 Memory Review Report Plan

Date: 2026-05-28

## Scope

Add a pure, deterministic audit report over `MemoryGovernanceLedger`.

## Units

- U1: planning artifacts and Trellis context.
- U2: typed review report builder.
- U3: bounded Markdown renderer.
- U4: behavior tests and focused gates.
- U5: solution, blog, index, full gates, and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-candidates test`
- `pnpm --filter @guga-agent/plugin-memory-candidates typecheck`
- `pnpm --filter @guga-agent/plugin-memory-candidates build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
