# M31 Memory JSONL Health Capability Plan

Date: 2026-05-28

## Scope

Expose the durable JSONL health projection as a plugin-owned read-only operation descriptor.

## Units

- U1: Trellis task context, research, and plan artifacts.
- U2: Add `memory.jsonl.health` descriptor registration.
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
