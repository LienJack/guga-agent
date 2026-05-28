# Memory JSONL Review Markdown Capability

Date: 2026-05-28

## 一句话结论

M33 should expose `memory.jsonl.review_markdown` as a read-only operation descriptor so hosts can discover display-ready durable review Markdown separately from the broad review projection.

## Evidence

- `Fact`: M23 adds `readReviewMarkdown()` to return a typed report, bounded Markdown, and JSONL diagnostics.
- `Fact`: M28 registers `memory.jsonl.review` as a broad durable review projection descriptor.
- `Fact`: M31 and M32 add descriptor-only surfaces for later JSONL projections once they become host-visible views.
- `Inference`: Markdown audit rendering is a distinct host display surface, so discovery should not require probing the store API.

## Guga Landing

Add `memory.jsonl.review_markdown` to `createMemoryJsonlPlugin()` as a first-party read-only operation descriptor while preserving `memory.jsonl.review`.

## Guardrails

- Keep descriptor-only scope.
- Keep memory trust read-only.
- Do not rename the existing review descriptor, because it is the compatibility surface for broad review projection.
