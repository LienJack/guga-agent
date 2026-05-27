# Memory JSONL Curated Markdown

M27 connects durable JSONL memory records to curated memory Markdown export.

## Problem

M19 added a pure Markdown renderer for active governed memory, but hosts using the JSONL store still had to rebuild the ledger and call the renderer manually.

## Decision

Add `JsonlMemoryStore.readCuratedMarkdown(options)`.

The method:

- calls `readGovernanceLedger()`;
- renders `ledger.items` with `renderCuratedMemoryMarkdown()`;
- returns the governed ledger, Markdown string, and JSONL diagnostics;
- fails closed on corrupt JSONL.

## Why This Shape

- **Renderer semantics stay shared.** Active-safe filtering, grouping, metadata, and truncation stay in `@guga-agent/plugin-memory-candidates`.
- **Storage diagnostics stay visible.** Partial-tail reads can render from complete records while preserving diagnostics.
- **No file writes.** Markdown is returned to the caller; this module does not mutate `MEMORY.md` or project files.
- **No context side effects.** Curated Markdown export remains separate from prompt injection.

## Verification

Focused tests cover successful rendering, scope/kind filters, empty state, partial-tail reads, and corrupt JSONL failure.
