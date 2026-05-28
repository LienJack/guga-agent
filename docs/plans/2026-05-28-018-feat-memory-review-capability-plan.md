# M21 Memory Review Capability Plan

Date: 2026-05-28

## Scope

Expose the memory review report as a discoverable first-party read-only operation.

## Units

- U1: planning artifacts and Trellis context.
- U2: plugin factory and public export.
- U3: descriptor behavior test and focused gates.
- U4: solution, blog, index.
- U5: full gates and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-candidates test`
- `pnpm --filter @guga-agent/plugin-memory-candidates typecheck`
- `pnpm --filter @guga-agent/plugin-memory-candidates build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
