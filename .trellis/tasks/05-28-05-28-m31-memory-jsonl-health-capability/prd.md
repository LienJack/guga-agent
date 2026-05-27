# M31 Memory JSONL Health Capability Descriptor

## Problem

M30 added `JsonlMemoryStore.readReviewHealthMarkdown()` so durable JSONL memory can produce the same compact review-health Markdown block as the in-memory review layer. The plugin capability surface still only exposes `memory.jsonl.review`, `memory.jsonl.retrieval`, and `memory.jsonl.curated_markdown` as read-only projections. Hosts that rely on capability discovery cannot distinguish the health projection without hard-coding store methods.

## Goals

- Register a read-only `memory.jsonl.health` operation descriptor from `createMemoryJsonlPlugin()`.
- Keep the existing broad `memory.jsonl` read/write descriptor unchanged.
- Preserve first-party plugin ownership and read-only memory trust metadata for the health descriptor.
- Add package tests proving the descriptor is discoverable through runtime capability listing.

## Non-Goals

- Do not add execution handlers or host commands.
- Do not rename existing descriptors.
- Do not change JSONL storage, review report, health calculation, or Markdown rendering semantics.

## Acceptance Criteria

- Runtime capability discovery includes `memory.jsonl.health` with `type: "operation"`, `source: "plugin"`, the caller-provided `ownerPluginId`, and read-only memory trust.
- Existing descriptor tests still pass for `memory.jsonl`, `memory.jsonl.review`, `memory.jsonl.retrieval`, and `memory.jsonl.curated_markdown`.
- Focused package gates pass:
  - `pnpm --filter @guga-agent/plugin-memory-jsonl test`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- Full workspace gates pass before archive:
  - `pnpm -r --workspace-concurrency=1 test`
  - `pnpm -r typecheck`
  - `pnpm -r build`

## Notes

This is an intentionally small follow-up to M30 and M28: make the durable health projection explainable to host/workbench surfaces without widening runtime execution scope.
