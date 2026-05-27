# M32 Memory JSONL Audit Snapshot Capability Descriptor

## Problem

M29 added `JsonlMemoryStore.readAuditSnapshot()` so durable JSONL memory can return ledger, review report, health, Markdown, and diagnostics in one inspection bundle. Runtime capability discovery still has no descriptor for this bundle. Hosts that assemble inspection panels would need to know the store method name instead of relying on plugin capability descriptors.

## Goals

- Register a read-only `memory.jsonl.audit_snapshot` operation descriptor from `createMemoryJsonlPlugin()`.
- Keep all existing JSONL memory descriptors unchanged.
- Preserve first-party plugin ownership and read-only memory trust metadata.
- Extend descriptor tests to cover the audit snapshot capability.

## Non-Goals

- Do not add execution handlers, CLI commands, or host protocol methods.
- Do not change audit snapshot data shape.
- Do not change JSONL corruption or partial-tail handling.

## Acceptance Criteria

- Runtime capability discovery includes `memory.jsonl.audit_snapshot` with `type: "operation"`, `source: "plugin"`, the caller-provided `ownerPluginId`, and read-only memory trust.
- Existing JSONL capability descriptor coverage still passes.
- Focused package gates pass:
  - `pnpm --filter @guga-agent/plugin-memory-jsonl test`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- Full workspace gates pass before archive:
  - `pnpm -r --workspace-concurrency=1 test`
  - `pnpm -r typecheck`
  - `pnpm -r build`

## Notes

This closes the discovery gap for the durable inspection bundle added in M29. It should remain a descriptor-only module.
