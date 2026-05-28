# Build Agent From Zero: M36 Memory JSONL Capability Namespace

M36 adds one small field to a lot of meaning.

## Ownership Is Not Grouping

A descriptor already has:

`ownerPluginId`

That tells us which plugin instance contributed the capability.

But host surfaces often need a different question:

Which capabilities belong to the same family?

For that, Guga descriptors already support:

`namespace`

## The Memory JSONL Namespace

M36 exports:

`MEMORY_JSONL_OPERATION_NAMESPACE`

with the value:

`memory-jsonl`

Every memory JSONL operation descriptor now carries that namespace.

## Why This Helps

A workbench can filter the capability list by namespace and find the whole durable memory family:

- storage;
- review report;
- review Markdown;
- health;
- audit snapshot;
- retrieval;
- curated Markdown.

It does not need to infer the family from string prefixes.

It does not need to rely only on plugin instance ownership.

## The Pattern

Use ids for exact capabilities.

Use ownership for provenance.

Use namespace for families.

M36 applies that capability-discovery vocabulary to durable memory.
