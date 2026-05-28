# Build Agent From Zero: M26 Memory JSONL Retrieval

M26 lets durable memory answer a user-shaped question:

What do we know, in this scope, about this topic?

## Retrieval Should Not Start As Magic

It is tempting to jump straight from "we have memory" to "inject the right memories into every prompt."

That is too much power too early.

Before memory earns a place in the model context, the runtime needs a boring, inspectable retrieval path. It should be clear which scope was searched, which items matched, and what storage diagnostics were present.

## The Pieces Already Existed

M17 gave Guga append-only JSONL memory records.

M18 gave Guga scope-required retrieval over governed memory items.

M26 connects those two pieces:

`JsonlMemoryStore.readRetrieval(query, options)`

The method reads durable records, rebuilds the governed ledger, and searches the ledger's items using the canonical retrieval function.

## Scope Is Still Required

The important rule did not change:

No scope, no retrieval.

The JSONL store does not turn memory into a global bag of facts. It delegates to the same retrieval rules that already require `project`, `user`, or another explicit scope.

That keeps durable memory from leaking across contexts just because it happens to live in one local file.

## Storage Problems Stay Visible

A partial JSONL tail can happen if a process is interrupted while writing.

M26 keeps the existing behavior:

- complete records can still be read;
- the partial-tail diagnostic is returned;
- append remains unavailable until repair.

Corrupt middle records still fail closed. Retrieval should never pretend a broken event log is healthy.

## Still No Automatic Injection

M26 returns retrieval results.

It does not push them into the model prompt.

That boundary matters. Retrieval is a read path. Context injection is a policy decision. Keeping those separate makes the future context layer easier to audit, test, and disable.

Memory is getting closer to the agent loop, but it is still walking there one explicit contract at a time.
