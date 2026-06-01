# @guga-agent/plugin-memory-jsonl Usage

## Purpose

`@guga-agent/plugin-memory-jsonl` persists memory candidates and decisions as JSONL records, then derives governed ledgers, review reports, health views, retrieval results, curated Markdown, and audit snapshots.

## Import

```ts
import {
  JsonlMemoryStore,
  MEMORY_JSONL_OPERATION_NAMES,
  createMemoryJsonlPlugin
} from "@guga-agent/plugin-memory-jsonl";
```

## Main APIs

- `JsonlMemoryStore`: JSONL-backed memory record store and derived-view reader.
- `createMemoryJsonlPlugin(options)`: registers discoverable memory JSONL operations.
- `MEMORY_JSONL_OPERATION_NAME`, `MEMORY_JSONL_OPERATION_NAMESPACE`, `MEMORY_JSONL_OPERATION_NAMES`, and `MEMORY_JSONL_READ_OPERATION_NAMES`: stable operation constants.
- Types for append, read, audit snapshot, review, health, retrieval, curated Markdown, diagnostics, records, and store options.

## Common Usage

```ts
const store = new JsonlMemoryStore({
  rootDir: ".guga/memory"
});

await store.appendCandidate(candidate);
await store.appendDecision(decision);

const ledger = await store.readGovernanceLedger();
const retrieval = await store.readRetrieval("package docs", {});
```

Install the plugin when a runtime should advertise the operation namespace:

```ts
const runtime = createAgentRuntime({
  plugins: [createMemoryJsonlPlugin()]
});
```

## Notes

- The plugin registers operation descriptors; callers still decide which store instance to use for actual persistence.
- `memory.jsonl` is read/write. Review, report, health, audit snapshot, retrieval, and curated Markdown operations are read-only descriptors.
- Appends refuse to continue when the JSONL file has blocking corruption or a partial final line.

## Related Packages

- `@guga-agent/plugin-memory-candidates` supplies candidate, governance, retrieval, and rendering logic.
- `@guga-agent/core` supplies operation descriptor contracts.
