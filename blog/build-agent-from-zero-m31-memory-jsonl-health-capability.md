# Build Agent From Zero: M31 Memory JSONL Health Capability

M31 is a tiny module, but it closes an important loop.

## A Method Is Not A Product Surface

M30 added:

`JsonlMemoryStore.readReviewHealthMarkdown()`

That is enough for code that already holds a store instance.

It is not enough for a host, CLI, or desktop workbench that discovers features through runtime capabilities.

Those surfaces should not ask, "does this object happen to have a method?" They should ask the runtime what the loaded plugin contributes.

## The New Descriptor

M31 adds:

`memory.jsonl.health`

It sits next to the other durable JSONL read projections:

- `memory.jsonl.review`
- `memory.jsonl.retrieval`
- `memory.jsonl.curated_markdown`

The broad `memory.jsonl` descriptor still represents read/write storage authority.

Health is different. It is a read-only status projection.

## Why Read-Only Matters

Memory is dangerous when every surface can silently write to it.

Guga's memory path keeps authority explicit:

- candidate creation is separate from governance;
- governance decisions are explicit;
- durable projections are read-only unless a module says otherwise;
- host UI discovers trust scope from descriptors.

That means a workbench can show "durable memory health is available" without implying it can mutate memory.

## The Pattern

As an agent grows, every useful store helper eventually needs a capability story.

Not every helper becomes a tool.

Some become descriptors.

M31 is that boundary: make the health surface explainable, but keep execution and mutation out of scope.
