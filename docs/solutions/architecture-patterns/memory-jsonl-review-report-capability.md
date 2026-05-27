# Memory JSONL Review Report Capability

M34 exposes the durable typed review report as a discoverable read-only capability.

## Problem

`JsonlMemoryStore.readReviewReport()` provides structured review data, but the plugin capability surface only exposed a broad review projection and the newer Markdown-specific descriptor.

## Decision

Register `memory.jsonl.review_report` from `createMemoryJsonlPlugin()`.

The descriptor:

- is an `operation`;
- is owned by the memory JSONL plugin;
- uses `source: "plugin"`;
- carries first-party read-only memory trust;
- keeps `memory.jsonl.review` unchanged.

## Why This Shape

- **Typed data is explicit.** Host code can discover the structured report without probing store methods.
- **Broad descriptor remains stable.** Existing consumers can continue to rely on `memory.jsonl.review`.
- **Projection authority is read-only.** The report inspects memory state; it does not mutate it.
- **Capability surface becomes complete.** Report, Markdown, health, audit snapshot, retrieval, and curated Markdown all have precise descriptors.

## Verification

The plugin descriptor test now includes `memory.jsonl.review_report` with the same ownership and read-only trust assertions as the other JSONL projections.
