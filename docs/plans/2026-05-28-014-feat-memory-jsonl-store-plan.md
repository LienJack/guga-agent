# M17 Memory JSONL Store Plan

Date: 2026-05-28

## Scope

Add a first-party local JSONL store package for memory candidates and governance decisions. It persists M15/M16 contracts and reuses M16 projection.

## Units

- U1: planning artifacts and Trellis context.
- U2: package scaffold and JSONL record types.
- U3: append/read store with diagnostics.
- U4: plugin descriptor and exports.
- U5: tests, review, solution, blog, archive.

## Validation

- `pnpm --filter @guga-agent/plugin-memory-jsonl test`
- `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
- `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- `pnpm -r --workspace-concurrency=1 test && pnpm -r typecheck && pnpm -r build`
