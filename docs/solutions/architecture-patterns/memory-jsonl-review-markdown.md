# Memory JSONL Review Markdown

M23 adds a ready-to-display Markdown audit view for durable memory records.

## Problem

M22 let hosts read a typed memory review report from JSONL, but simple host and CLI surfaces still had to call the Markdown renderer themselves.

## Decision

Add `JsonlMemoryStore.readReviewMarkdown(options)`.

The method:

- calls `readReviewReport()`;
- renders the result with `renderMemoryReviewReport()`;
- returns the typed report, Markdown string, and JSONL diagnostics;
- fails closed when JSONL is corrupt.

## Why This Shape

- **Renderer reuse.** The canonical Markdown shape stays in `@guga-agent/plugin-memory-candidates`.
- **Display convenience.** Hosts get a single durable read path for an audit page or CLI output.
- **No persistence side effects.** Markdown is returned as a string, not written to disk.
- **Diagnostics preserved.** Partial-tail warnings and corrupt-record failures keep the same semantics as JSONL reads.

## Verification

Focused tests cover custom title/render options, active-item truncation, partial-tail diagnostics, and corrupt JSONL failure.
