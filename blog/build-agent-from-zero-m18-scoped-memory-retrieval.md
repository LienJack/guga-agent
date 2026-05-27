# Build Agent From Zero: M18 Scoped Memory Retrieval

M18 is the first time Guga asks memory a question.

Carefully.

## Retrieval Is Where Memory Gets Dangerous

Writing memory is only half the story.

The real risk appears when the runtime starts bringing memory back into the working context. A bad retrieval layer can mix users, projects, stale facts, unsafe text, and irrelevant summaries into a prompt that looks authoritative.

So M18 does retrieval with a brake on.

## Scope First

`searchGovernedMemoryItems()` requires an explicit scope.

No scope, no results.

That one rule matters more than the scoring algorithm. It prevents the most basic category error: treating memory as one global bag of facts.

## Lexical Before Vector

M18 uses deterministic lexical matching.

It scores:

- query term overlap;
- kind matches;
- tag matches;
- confidence;
- importance.

This is not the final search engine. It is the contract rehearsal.

Before adding embeddings, Guga needs to know what a result looks like, how filters work, how reasons are explained, and how rendering stays bounded.

## Active Safe Only

The retriever consumes governed memory items from M16.

By default it only returns items that are:

- active;
- safe;
- in the requested scope.

Superseded items require an explicit opt-in. Unsafe content is filtered again at retrieval time.

## Results Explain Themselves

Every result includes matched terms and reasons.

That small detail keeps retrieval auditable. A host can show not just "this memory was selected", but "this memory matched these terms and filters".

For an agent workbench, that is the difference between trust and vibes.

## Still No Automatic Injection

M18 can render a bounded retrieval block, but it does not attach that block to model requests.

That remains a future context-policy decision.

The architecture stays clean:

- candidate;
- decision;
- durable store;
- scoped retrieval;
- later, budgeted injection.

Memory keeps earning its way toward the prompt.
