# M27 Memory JSONL Curated Markdown

## Goal

Let the JSONL memory store render durable governed memory as curated Markdown.

## Requirements

- Add a read-only curated Markdown helper to `JsonlMemoryStore`.
- Reuse `renderCuratedMemoryMarkdown()` from `@guga-agent/plugin-memory-candidates`.
- Return the governed ledger, Markdown string, and JSONL diagnostics.
- Preserve corrupt-file behavior: corrupt JSONL should return `ok: false`.
- Preserve partial-tail behavior: render from complete records and include the recoverable diagnostic.
- Export any new JSONL result type from `@guga-agent/plugin-memory-jsonl`.

## Out of Scope

- No file writes to `MEMORY.md`, `USER.md`, or project docs.
- No prompt/context injection.
- No automatic memory decisions or repair behavior.
- No CLI command in this module.

## Acceptance

- Behavior tests cover successful curated Markdown rendering, filters/options, partial-tail diagnostics, empty state, and corrupt-file failure.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
