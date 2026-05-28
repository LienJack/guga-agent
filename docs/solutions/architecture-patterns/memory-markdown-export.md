# Memory Markdown Export

M19 adds a pure Markdown projection for active governed memory.

## Problem

JSONL is durable, but not pleasant for human review. Before Guga mutates `MEMORY.md` or `USER.md`, it needs a safe projection humans can inspect.

## Decision

Add `renderCuratedMemoryMarkdown()` to `@guga-agent/plugin-memory-candidates`.

The renderer:

- exports active safe items only;
- groups by scope and kind;
- includes confidence and importance;
- optionally includes tags and source event IDs;
- bounds item count and content length;
- returns a string without writing files.

## Why This Shape

- **Export before mutation.** Humans can review output before any file-writing feature exists.
- **Governed memory only.** Candidates must already have passed the active-item projection.
- **Readable provenance.** Source event IDs stay visible in the Markdown.
- **No prompt side effects.** Markdown export is not context injection.

## Verification

Focused tests cover grouping, filtering, truncation, metadata rendering, source refs, and empty state.
