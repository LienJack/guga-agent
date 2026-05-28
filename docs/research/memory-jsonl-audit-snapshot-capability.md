# Memory JSONL Audit Snapshot Capability

Date: 2026-05-28

## 一句话结论

M32 should expose `memory.jsonl.audit_snapshot` as a read-only operation descriptor so host inspection surfaces can discover the durable JSONL audit bundle without coupling to store internals.

## Evidence

- `Fact`: M29 adds `readAuditSnapshot()` to return durable ledger, report, health, Markdown, and JSONL diagnostics from one read.
- `Fact`: M28 registers JSONL projection descriptors as read-only operation capabilities.
- `Fact`: M31 adds the health projection descriptor after M30 introduced health Markdown.
- `Inference`: Audit snapshot is a host-facing inspection projection and should be discoverable alongside review, health, retrieval, and curated Markdown.

## Guga Landing

Add `memory.jsonl.audit_snapshot` to `createMemoryJsonlPlugin()` as a first-party read-only operation descriptor.

## Guardrails

- Keep the broad `memory.jsonl` read/write descriptor unchanged.
- Do not turn the audit snapshot into an LLM-callable tool in this module.
- Keep trust metadata read-only because the snapshot only observes durable memory state.
