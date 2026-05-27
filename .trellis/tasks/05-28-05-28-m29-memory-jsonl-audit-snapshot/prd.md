# M29 Memory JSONL Audit Snapshot

## Goal

Let hosts read a durable memory audit snapshot from JSONL in one call.

## Requirements

- Add `readAuditSnapshot()` to `JsonlMemoryStore`.
- Reuse the canonical governance ledger, review report, review health, and review Markdown functions.
- Return the ledger, report, health, Markdown audit view, and JSONL diagnostics.
- Preserve corrupt-file behavior: corrupt JSONL should return `ok: false`.
- Preserve partial-tail behavior: build the snapshot from complete records and include the recoverable diagnostic.
- Export the new result type from `@guga-agent/plugin-memory-jsonl`.

## Out of Scope

- No new retrieval behavior.
- No curated Markdown changes.
- No file writes or prompt/context injection.
- No CLI command in this module.

## Acceptance

- Behavior tests cover healthy snapshot, partial-tail diagnostics, custom Markdown options, empty snapshot, and corrupt-file failure.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
