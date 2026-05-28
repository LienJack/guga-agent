# M22 Memory JSONL Review Report

## Goal

Let the JSONL memory store produce a read-only memory review report from durable candidate and decision records.

## Requirements

- Add `readReviewReport()` to `JsonlMemoryStore`.
- Reuse `readRecords()` and `createMemoryGovernanceLedger()` before creating the review report.
- Return JSONL read diagnostics alongside the review report.
- Preserve corrupt-file behavior: corrupt JSONL should return `ok: false`.
- Export any new result type from `@guga-agent/plugin-memory-jsonl`.

## Out of Scope

- No new append or repair behavior.
- No automatic review decisions.
- No Markdown file writes or prompt injection.
- No new capability descriptor.

## Acceptance

- Behavior tests cover successful report reads, partial-tail diagnostics, and corrupt-file failure.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
