# M23 Memory JSONL Review Markdown

## Goal

Let the JSONL memory store produce a bounded Markdown memory review report for host and CLI display.

## Requirements

- Add `readReviewMarkdown()` to `JsonlMemoryStore`.
- Reuse `readReviewReport()` and `renderMemoryReviewReport()`.
- Return the typed report, Markdown string, and JSONL diagnostics.
- Preserve corrupt-file behavior: corrupt JSONL should return `ok: false`.
- Export any new result type from `@guga-agent/plugin-memory-jsonl`.

## Out of Scope

- No Markdown file writes.
- No automatic memory decisions.
- No JSONL repair behavior.
- No CLI command in this module.

## Acceptance

- Behavior tests cover successful Markdown rendering, custom render options, partial-tail diagnostics, and corrupt-file failure.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
