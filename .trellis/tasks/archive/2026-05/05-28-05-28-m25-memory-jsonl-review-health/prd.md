# M25 Memory JSONL Review Health

## Goal

Let the JSONL memory store produce a read-only memory review health summary from durable candidate and decision records.

## Requirements

- Add `readReviewHealth()` to `JsonlMemoryStore`.
- Reuse `readReviewReport()` and `createMemoryReviewHealth()`.
- Return the typed report, health summary, and JSONL diagnostics.
- Preserve corrupt-file behavior: corrupt JSONL should return `ok: false`.
- Export any new result type from `@guga-agent/plugin-memory-jsonl`.

## Out of Scope

- No automatic decisions.
- No JSONL repair behavior.
- No Markdown file writes or prompt injection.
- No CLI command in this module.

## Acceptance

- Behavior tests cover healthy, needs-review, partial-tail, and corrupt-file failure.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
