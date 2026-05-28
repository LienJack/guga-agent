# Memory JSONL Capability Surface

M28 makes durable JSONL memory projections visible in capability discovery.

## Problem

`createMemoryJsonlPlugin()` exposed only a broad `memory.jsonl` operation, even though the JSONL store now has several read-only projections for review, retrieval, and curated Markdown.

## Decision

Keep `memory.jsonl` as the broad read/write storage descriptor and add read-only projection descriptors:

- `memory.jsonl.review`
- `memory.jsonl.retrieval`
- `memory.jsonl.curated_markdown`

## Why This Shape

- **Compatibility stays intact.** Existing hosts that look for `memory.jsonl` still find it.
- **Read projections are explicit.** Workbench surfaces can distinguish storage authority from read-only views.
- **Trust remains narrow.** Projection descriptors carry only memory read trust.
- **Discovery is not execution.** The plugin names surfaces without adding handlers or changing permissions.

## Verification

Focused tests prove the broad descriptor remains read/write and each projection descriptor is plugin-owned, first-party, and memory read-only.
