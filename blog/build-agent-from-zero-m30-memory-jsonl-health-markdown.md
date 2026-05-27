# Build Agent From Zero: M30 Memory JSONL Health Markdown

M30 gives durable memory a small status card.

## Full Audit Is Not Always The Right Shape

M29 added an audit snapshot: ledger, report, health, and Markdown.

That is useful for a full inspection panel. But many host surfaces only need a compact answer:

Is memory healthy?

For that, a full report is too much.

## The Health Block

M24 already introduced a health renderer:

`renderMemoryReviewHealthBlock()`

M25 wired health into the JSONL store as typed data.

M30 connects those two:

`JsonlMemoryStore.readReviewHealthMarkdown()`

It returns:

- the typed report;
- the health summary;
- a compact Markdown block;
- JSONL diagnostics.

## Why Keep This Separate From The Snapshot

The audit snapshot is for inspection.

The health block is for status.

Keeping both shapes makes host UI simpler. A status bar can ask for health Markdown. A review panel can ask for the snapshot.

Neither path changes memory.

## Partial Logs Still Speak

If the JSONL file has a partial final line, the helper still reads complete records and returns the partial-tail diagnostic.

If the file is corrupt in the middle, it fails closed.

The status card is compact, but it is not allowed to be vague.

## The Pattern

As Guga grows, durable memory surfaces should be precise:

- typed data when code needs structure;
- Markdown when humans need display;
- diagnostics everywhere;
- mutation nowhere unless explicitly requested.

M30 is that pattern in miniature.
