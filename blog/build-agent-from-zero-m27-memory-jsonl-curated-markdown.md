# Build Agent From Zero: M27 Memory JSONL Curated Markdown

M27 makes durable memory readable as curated Markdown.

Still not writable. Still not injected.

## Durable Memory Needs A Human Surface

JSONL is a good source of truth for machines.

It is append-only, auditable, and easy to replay. But it is not the format a human wants to inspect when asking, "What does this agent currently believe is stable memory?"

M19 already gave Guga a Markdown renderer for governed memory items.

M27 wires that renderer into the durable JSONL store.

## The New Read Path

`JsonlMemoryStore.readCuratedMarkdown()` does three things:

1. reads durable candidate and decision records;
2. rebuilds the governed memory ledger;
3. renders active safe items with the canonical Markdown exporter.

The method returns:

- the governed ledger;
- the Markdown string;
- JSONL diagnostics.

That keeps the host from reassembling the same pipeline every time it wants a readable memory view.

## Markdown Is A Projection

This module does not write `MEMORY.md`.

That boundary matters. A generated Markdown string is inspectable and disposable. A file write changes the user's project and deserves its own permission and review story.

So M27 stays read-only.

The caller can show the Markdown in a UI, save it later with explicit approval, or compare it in an audit surface. The storage plugin does not decide.

## Partial Logs Stay Honest

If the JSONL file has a partial final line, M27 renders from complete records and returns the partial-tail diagnostic.

If the middle of the file is corrupt, it fails closed.

Readable memory should never hide the health of its source log.

## Why This Comes Before Injection

Before memory influences the model, humans and tools need to see it clearly.

M27 gives Guga a durable, readable memory view that can support future workflows:

- manual review;
- export previews;
- diffable memory files;
- context-policy injection.

The order is the point: inspect first, write later, inject last.
