# Memory JSONL Health Markdown

M30 renders durable memory health as a compact Markdown block.

## Problem

M25 exposed typed durable review health, but host status surfaces still had to call the health renderer themselves.

## Decision

Add `JsonlMemoryStore.readReviewHealthMarkdown(options)`.

The method:

- calls `readReviewHealth()`;
- renders `renderMemoryReviewHealthBlock()`;
- returns the report, health, Markdown block, and JSONL diagnostics;
- fails closed on corrupt JSONL.

## Why This Shape

- **Status surface friendly.** Hosts can show compact memory health without rendering a full audit report.
- **Shared semantics.** Health rules and Markdown layout stay in `@guga-agent/plugin-memory-candidates`.
- **Storage diagnostics stay visible.** Partial-tail diagnostics remain attached to successful reads.
- **No mutation.** The helper returns Markdown; it does not write files or inject context.

## Verification

Focused tests cover healthy output, custom titles, empty memory, partial-tail needs-review output, and corrupt JSONL failure.
