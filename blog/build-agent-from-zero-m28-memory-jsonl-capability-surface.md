# Build Agent From Zero: M28 Memory JSONL Capability Surface

M28 gives durable memory projections names.

Not tools. Not commands. Names.

## Why Names Matter

By M27, the JSONL memory store could do several useful read-only things:

- produce a review view;
- search governed memory;
- render curated Markdown.

But capability discovery still only said one thing:

`memory.jsonl`

That was true, but too broad. It mixed storage authority with projection surfaces.

## Storage Is Not Projection

The broad `memory.jsonl` descriptor still matters.

It tells the host that this plugin owns durable JSONL memory storage and may need both read and write memory authority.

The newer surfaces are different. They are read-only views over the same durable facts:

- `memory.jsonl.review`
- `memory.jsonl.retrieval`
- `memory.jsonl.curated_markdown`

Those names let a workbench show exactly which memory surfaces exist without implying that every surface can mutate memory.

## Discovery Is Not Execution

M28 does not add handlers.

It only registers descriptors.

That boundary keeps capability discovery honest. A descriptor says, "this surface exists and belongs to this plugin." Execution, permission prompts, UI buttons, and commands can be layered on later.

## Narrow Trust

The projection descriptors are first-party and memory read-only.

That is the important split:

- durable storage descriptor: read/write;
- durable projection descriptors: read-only.

The agent workbench can now explain memory more precisely before it allows anyone to run or expose memory actions.

Small names, better control surface.
