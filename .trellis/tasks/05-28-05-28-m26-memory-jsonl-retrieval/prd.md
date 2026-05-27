# M26 Memory JSONL Retrieval

## Goal

Let the JSONL memory store run scope-required retrieval over durable governed memory records.

## Requirements

- Add a read-only retrieval helper to `JsonlMemoryStore`.
- Reuse the canonical M18 retrieval implementation from `@guga-agent/plugin-memory-candidates`.
- Return typed retrieval results plus JSONL diagnostics.
- Preserve corrupt-file behavior: corrupt JSONL should return `ok: false`.
- Preserve partial-tail behavior: parse complete records, return diagnostics, and still retrieve from complete records.
- Export any new JSONL retrieval result type from `@guga-agent/plugin-memory-jsonl`.

## Out of Scope

- No embedding/vector search.
- No prompt/context injection.
- No mutation, repair, or automatic memory decisions.
- No CLI command in this module.

## Acceptance

- Behavior tests cover successful retrieval, scope filtering, partial-tail diagnostics, empty/invalid query diagnostics, and corrupt-file failure.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
