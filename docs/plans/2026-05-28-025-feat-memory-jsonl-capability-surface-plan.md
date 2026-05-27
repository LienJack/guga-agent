# M28 Memory JSONL Capability Surface Plan

Date: 2026-05-28

## Scope

Expose durable JSONL memory read projections as plugin-owned operation descriptors.

## Units

- U1: planning artifacts and Trellis context.
- U2: plugin operation descriptor registration.
- U3: descriptor behavior tests and focused gates.
- U4: solution, blog, index.
- U5: full gates and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-jsonl test`
- `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
- `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
