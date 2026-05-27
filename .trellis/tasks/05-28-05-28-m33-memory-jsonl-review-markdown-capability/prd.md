# M33 Memory JSONL Review Markdown Capability Descriptor

## Problem

M23 added `JsonlMemoryStore.readReviewMarkdown()` so durable JSONL memory can render a bounded Markdown audit view. The plugin currently exposes `memory.jsonl.review` as the broad review projection descriptor, but host/workbench surfaces cannot discover the Markdown-specific view without knowing the store method. This matters because typed review data and display-ready Markdown support different UI paths.

## Goals

- Register a read-only `memory.jsonl.review_markdown` operation descriptor from `createMemoryJsonlPlugin()`.
- Keep the existing `memory.jsonl.review` descriptor unchanged for compatibility.
- Preserve first-party plugin ownership and read-only memory trust metadata.
- Extend descriptor tests to cover the Markdown-specific review capability.

## Non-Goals

- Do not remove, rename, or reinterpret `memory.jsonl.review`.
- Do not add execution handlers, CLI commands, or host protocol methods.
- Do not change review report or Markdown rendering semantics.

## Acceptance Criteria

- Runtime capability discovery includes `memory.jsonl.review_markdown` with `type: "operation"`, `source: "plugin"`, the caller-provided `ownerPluginId`, and read-only memory trust.
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

This module keeps descriptor names additive. Hosts may continue to use `memory.jsonl.review` as a broad review projection while using `memory.jsonl.review_markdown` when they need display-ready audit Markdown.
