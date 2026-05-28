# Memory JSONL Audit Snapshot

Date: 2026-05-28

## 一句话结论

M29 should add a durable audit snapshot read path so hosts can retrieve ledger, report, health, and Markdown audit output from JSONL with one parse.

## Evidence

- `Fact`: M22 reads a typed review report from durable JSONL records.
- `Fact`: M23 renders a Markdown review audit from the typed report.
- `Fact`: M25 computes durable review health from the same report.
- `Fact`: Repeating those calls separately reopens and parses the same JSONL file multiple times.
- `Inference`: A read-only snapshot helper is a host ergonomics layer, not a new memory governance or injection behavior.

## Guga Landing

Add `JsonlMemoryStore.readAuditSnapshot(options)`.

The method should:

- call `readGovernanceLedger()` once;
- build a review report from the ledger;
- compute health from the report;
- render review Markdown from the report;
- return `{ ledger, report, health, markdown, diagnostics }`;
- fail closed on corrupt JSONL.

## Guardrails

- Keep report and health semantics in `@guga-agent/plugin-memory-candidates`.
- Keep JSONL diagnostics in `@guga-agent/plugin-memory-jsonl`.
- Do not write files or inject memory into model context.
- Do not include retrieval results in the audit snapshot.
