# Build Agent From Zero: M21 Memory Review Capability

M21 is small, but it matters.

The memory review report now has a name in the capability system.

## Why A Descriptor

M20 created the report itself.

But a host needs a way to discover that the report exists. Guga already uses capability descriptors to explain plugin-owned operations, so memory review should join that surface instead of becoming a hidden helper.

## What Changed

M21 adds `createMemoryReviewPlugin()`.

It registers `memory.review` as:

- plugin-owned;
- first-party;
- memory scoped;
- read-only.

That last part is the important part.

Review is an audit capability. It should not imply permission to accept candidates, write JSONL records, edit Markdown memory files, or inject context into the model.

## The Design Rule

Discovery is not authority.

A descriptor can say, "this surface exists," while still keeping execution, mutation, and review decisions somewhere more explicit.

That is the pattern Guga keeps using as the memory stack grows:

- candidates are proposed;
- governance records decisions;
- JSONL stores facts;
- retrieval searches active safe memory;
- Markdown exports readable memory;
- review reports health;
- capability discovery names the surface.

Each layer says exactly what it can do.

M21 gives review its name without giving it extra power.
