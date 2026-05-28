# M30 Memory JSONL Health Markdown

## Goal

Let the JSONL memory store render durable review health as a compact Markdown block.

## Requirements

- Add `readReviewHealthMarkdown()` to `JsonlMemoryStore`.
- Reuse `readReviewHealth()` and `renderMemoryReviewHealthBlock()`.
- Return the report, health, Markdown block, and JSONL diagnostics.
- Preserve corrupt-file behavior: corrupt JSONL should return `ok: false`.
- Preserve partial-tail behavior: compute health from complete records and include the recoverable diagnostic.
- Export the new result type from `@guga-agent/plugin-memory-jsonl`.

## Out of Scope

- No changes to health status rules.
- No full audit snapshot changes.
- No file writes or prompt/context injection.
- No CLI command in this module.

## Acceptance

- Behavior tests cover healthy Markdown, needs-review partial-tail Markdown, custom title, empty state, and corrupt-file failure.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
