# M37 Memory JSONL Public Capability Exports Plan

Date: 2026-05-28

## Scope

Protect host-facing package exports for memory JSONL capability constants.

## Units

- U1: Trellis task context, research, and plan artifacts.
- U2: Add public entrypoint export test.
- U3: Run focused gates and commit.
- U4: Write solution doc, blog article, and research index entry.
- U5: Run full gates and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-jsonl test`
- `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
- `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
