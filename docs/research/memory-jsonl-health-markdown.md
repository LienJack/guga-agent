# Memory JSONL Health Markdown

Date: 2026-05-28

## 一句话结论

M30 should add a durable read helper that renders the memory review health signal as a compact Markdown block for host status surfaces.

## Evidence

- `Fact`: M24 added `createMemoryReviewHealth()` and `renderMemoryReviewHealthBlock()`.
- `Fact`: M25 added `JsonlMemoryStore.readReviewHealth()` for durable JSONL records.
- `Fact`: M29 added a full audit snapshot, but status bars and compact panels do not always need the full report Markdown.
- `Inference`: A compact health Markdown helper improves host ergonomics while preserving the same health rules.

## Guga Landing

Add `JsonlMemoryStore.readReviewHealthMarkdown(options)`.

The method should:

- call `readReviewHealth()`;
- fail closed on corrupt JSONL;
- render the health block using `renderMemoryReviewHealthBlock()`;
- return `{ report, health, markdown, diagnostics }`.

## Guardrails

- Keep health rules and rendering in `@guga-agent/plugin-memory-candidates`.
- Keep JSONL diagnostics in `@guga-agent/plugin-memory-jsonl`.
- Do not write Markdown files.
- Do not inject health Markdown into model context.
