# Build Agent From Zero: M17 Memory JSONL Store

M17 gives memory a place to sit down.

Not a vector database. Not a graph. Not a magic user profile.

Just append-only JSONL.

## Why This Comes After Governance

It is tempting to start memory with storage. Pick a database, write facts, retrieve them later.

Guga deliberately waited.

M15 defined candidates. M16 defined decisions. Only now does M17 add persistence.

That order matters because a store should preserve the memory model, not become the memory model.

## The Shape

`@guga-agent/plugin-memory-jsonl` stores two record types:

- memory candidates;
- memory decisions.

When reopened, it feeds those records back through `createMemoryGovernanceLedger()`.

So the same safety and governance rules apply whether records are in memory or on disk.

## Append-Only Is The Product Choice

Memory history should be inspectable.

If a candidate was accepted and later rejected, that is not a contradiction to erase. It is a decision trail to preserve.

JSONL fits this stage because every line is a durable fact:

- candidate proposed;
- decision accepted;
- decision rejected;
- decision superseded.

No hidden mutation is required.

## Corruption Handling

The store is intentionally conservative.

A partial final line is treated as a recoverable tail and ignored for reading, but append is refused until repaired.

A corrupt middle line fails the read. Dropping it would make later records look trustworthy when the chain is not.

That mirrors the broader Guga rule: recovery is good, silent repair is not.

## Why Still No Retrieval

M17 can persist memories, but it still does not search or inject them.

That is restraint, not incompleteness.

Before retrieval, Guga needs durable scope rules, deletion semantics, review UI, and budgeted context injection. JSONL gives those future systems a trustworthy local source without pretending to solve all of memory.

## What Comes Next

Good next steps are now clear:

- a review surface over candidates and decisions;
- export to curated memory markdown;
- scoped retrieval over active items;
- context-policy injection from governed active memory only.

The foundation is small, which is exactly why it can grow.
