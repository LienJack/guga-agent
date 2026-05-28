# M36 Memory JSONL Capability Namespace Plan

Date: 2026-05-28

## Scope

Add stable namespace metadata to memory JSONL operation descriptors and export the namespace constant.

## Units

- U1: Trellis task context, research, and plan artifacts.
- U2: Add namespace constant and descriptor metadata.
- U3: Update descriptor tests and run focused gates.
- U4: Write solution doc, blog article, and research index entry.
- U5: Run full gates and archive.

## Verification

- `pnpm --filter @guga-agent/plugin-memory-jsonl test`
- `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
- `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
