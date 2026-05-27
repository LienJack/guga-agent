# Memory JSONL Capability Namespace

Date: 2026-05-28

## 一句话结论

M36 should add `namespace: "memory-jsonl"` to all JSONL memory operation descriptors so hosts can filter the capability family through the standard descriptor namespace field.

## Evidence

- `Fact`: Core capability descriptors support optional `namespace`.
- `Fact`: Skills and MCP plugins already use namespace for source grouping.
- `Fact`: M35 exports the JSONL operation-name vocabulary.
- `Inference`: JSONL memory now has enough descriptors to benefit from the same grouping metadata.

## Guga Landing

Export `MEMORY_JSONL_OPERATION_NAMESPACE = "memory-jsonl"` and pass it to all `registerOperation()` calls in `createMemoryJsonlPlugin()`.

## Guardrails

- Keep `ownerPluginId` intact; namespace is grouping metadata, not ownership.
- Keep names and trust unchanged.
- Do not introduce namespace-specific lookup APIs in this module.
