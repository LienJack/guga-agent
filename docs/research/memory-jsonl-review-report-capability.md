# Memory JSONL Review Report Capability

Date: 2026-05-28

## 一句话结论

M34 should expose `memory.jsonl.review_report` as a read-only operation descriptor so hosts can discover the typed durable review report separately from Markdown and broad review projection surfaces.

## Evidence

- `Fact`: M22 adds `readReviewReport()` to project durable JSONL records through governance into the typed memory review report.
- `Fact`: M28 registers `memory.jsonl.review` as a broad durable review projection descriptor.
- `Fact`: M33 adds `memory.jsonl.review_markdown` so display-ready Markdown has a precise descriptor.
- `Inference`: Typed review report is a distinct host-facing data surface and should be discoverable without method probing.

## Guga Landing

Add `memory.jsonl.review_report` to `createMemoryJsonlPlugin()` as a first-party read-only operation descriptor while preserving `memory.jsonl.review`.

## Guardrails

- Keep descriptor-only scope.
- Keep memory trust read-only.
- Do not change report shape or JSONL read semantics.
