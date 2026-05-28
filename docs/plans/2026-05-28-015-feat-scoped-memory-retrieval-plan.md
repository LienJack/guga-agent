# M18 Scoped Memory Retrieval Plan

Date: 2026-05-28

## Scope

Add deterministic, scope-required lexical retrieval over governed memory items in `@guga-agent/plugin-memory-candidates`.

## Units

- U1: planning artifacts and Trellis context.
- U2: retrieval types, scoring, diagnostics, rendering.
- U3: tests and focused package gates.
- U4: solution, blog, research index.
- U5: full gates, review, archive.

## Validation

- `pnpm --filter @guga-agent/plugin-memory-candidates test`
- `pnpm --filter @guga-agent/plugin-memory-candidates typecheck`
- `pnpm --filter @guga-agent/plugin-memory-candidates build`
- `pnpm -r --workspace-concurrency=1 test && pnpm -r typecheck && pnpm -r build`
