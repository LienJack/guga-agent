# Build Agent From Zero: M16 Memory Governance Store

M15 said: memory starts as a candidate.

M16 adds the next sentence: a candidate becomes memory only after a decision.

## The Gap

A memory candidate is useful because it has provenance and safety checks. But it still leaves a product question unanswered:

Who decided this should become memory?

That question matters. A long-running agent should not quietly promote a sentence into future context just because it looks plausible. Stable memory needs a small governance record: accept, reject, or supersede.

## The Move

M16 extends `@guga-agent/plugin-memory-candidates` with governed memory projection.

The new layer takes two inputs:

- memory candidates;
- explicit memory decisions.

It produces active memory items.

There is still no automatic write. There is still no vector database. There is still no hidden prompt injection.

The important thing is the transition.

## Decisions As Facts

The core record is `MemoryDecision`.

It stores:

- which candidate was reviewed;
- whether the action was `accept`, `reject`, or `supersede`;
- when it happened;
- who reviewed it;
- why the decision was made;
- which existing item it replaces, when superseding.

That makes memory review auditable instead of magical.

## Active Memory Is A Projection

`createMemoryGovernanceLedger()` walks decisions in deterministic order.

An accept decision creates an active memory item only if the candidate is valid and safe.

A later reject removes active items for that candidate.

A supersede decision marks the old item as superseded and creates a newer active item.

This keeps the original candidate, the decision, and the projected item separate. That separation is the trick.

## Safety Still Wins

M16 does not trust a candidate just because a decision says `accept`.

Before projection, it validates the candidate and rescans the content. If the candidate contains prompt-injection-like text or mismatched safety metadata, it does not become active memory.

That gives future UI and host layers a simple rule: the governance ledger can explain why an item is active, and unsafe content cannot sneak through the projection boundary.

## Why No Retrieval Yet

Retrieval is tempting. Search boxes are satisfying. Embeddings feel like progress.

But retrieval before governance just makes bad memory easier to reuse.

M16 stays with the boring but necessary part:

- decide;
- project;
- list by scope;
- render a bounded block for inspection.

That is enough foundation for a future `MEMORY.md`, SQLite table, vector store, or context-policy injector.

## What Comes Later

The next memory steps can now be smaller:

- a host UI for reviewing candidates;
- a persistent store for decisions and active items;
- import/export to curated memory files;
- retrieval with required scope filters;
- context-policy injection that consumes only active safe items.

The important constraint survives all of those: memory should not be a hidden side effect.

It should be a decision trail.
