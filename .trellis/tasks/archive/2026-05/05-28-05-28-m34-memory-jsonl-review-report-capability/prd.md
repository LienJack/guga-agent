# M34 Memory JSONL Review Report Capability Descriptor

## Problem

M22 added `JsonlMemoryStore.readReviewReport()` so durable JSONL memory can return a typed review report. The plugin exposes the broad `memory.jsonl.review` descriptor and, after M33, the Markdown-specific descriptor. Hosts still cannot discover the typed report surface explicitly without coupling to the store method.

## Goals

- Register a read-only `memory.jsonl.review_report` operation descriptor from `createMemoryJsonlPlugin()`.
- Keep the existing `memory.jsonl.review` descriptor unchanged for compatibility.
- Preserve first-party plugin ownership and read-only memory trust metadata.
- Extend descriptor tests to cover the typed report capability.

## Non-Goals

- Do not remove or rename `memory.jsonl.review`.
- Do not change review report data shape.
- Do not add execution handlers, CLI commands, or host protocol methods.

## Acceptance Criteria

- Runtime capability discovery includes `memory.jsonl.review_report` with `type: "operation"`, `source: "plugin"`, the caller-provided `ownerPluginId`, and read-only memory trust.
- Existing JSONL capability descriptor coverage remains green.
- Focused package gates pass:
  - `pnpm --filter @guga-agent/plugin-memory-jsonl test`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- Full workspace gates pass before archive:
  - `pnpm -r --workspace-concurrency=1 test`
  - `pnpm -r typecheck`
  - `pnpm -r build`

## Notes

This module makes the descriptor surface explicit: broad review, typed review report, review Markdown, health, audit snapshot, retrieval, and curated Markdown can now each be discovered independently.
