# Memory Review Report

Date: 2026-05-28

## 一句话结论

M20 should add a pure audit/reporting layer over the governed memory ledger so humans can inspect memory health before any import, export, or prompt-context automation.

## Evidence

- `Fact`: M15 validates memory candidates and marks unsafe content instead of trusting raw text.
- `Fact`: M16 derives active, superseded, and rejected memory state from explicit review decisions.
- `Fact`: M17 stores candidates and decisions append-only, while M19 deliberately avoids writing curated Markdown automatically.
- `Inference`: A review report is the next low-risk module because it improves observability without adding autonomous mutation.

## Guga Landing

Add `createMemoryReviewReport(ledger, options)` and `renderMemoryReviewReport(report, options)` to `@guga-agent/plugin-memory-candidates`.

The report should expose:

- summary counts for governance state,
- deterministic queues for active, superseded, rejected, undecided, and unsafe memory records,
- diagnostic count and diagnostic details,
- bounded Markdown rendering for operator review.

## Guardrails

- Treat unsafe candidates as audit records only.
- Do not couple reporting to filesystem storage.
- Do not let Markdown rendering become a persistence path.
