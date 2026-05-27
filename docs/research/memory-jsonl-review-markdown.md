# Memory JSONL Review Markdown

Date: 2026-05-28

## 一句话结论

M23 should add a read-only durable Markdown audit view by composing `JsonlMemoryStore.readReviewReport()` with `renderMemoryReviewReport()`.

## Evidence

- `Fact`: M20 owns the canonical Markdown renderer for memory review reports.
- `Fact`: M22 lets JSONL memory stores read a typed review report from durable records.
- `Inference`: Host and CLI surfaces should not each reimplement Markdown rendering.

## Guga Landing

Add `JsonlMemoryStore.readReviewMarkdown(options)`.

The method should:

- call `readReviewReport()`,
- fail closed on corrupt JSONL,
- render Markdown with the existing M20 renderer,
- return `{ report, markdown, diagnostics }` for successful reads.

## Guardrails

- Do not write Markdown files.
- Do not add a CLI command yet.
- Preserve JSONL read diagnostics exactly.
