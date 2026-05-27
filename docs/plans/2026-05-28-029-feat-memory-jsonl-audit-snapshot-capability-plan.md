# M32 Memory JSONL Audit Snapshot Capability Plan

Date: 2026-05-28

## Scope

Expose the durable JSONL audit snapshot as a plugin-owned read-only operation descriptor.

## Units

- U1: Trellis task context, research, and plan artifacts.
- U2: Add `memory.jsonl.audit_snapshot` descriptor registration.
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
