# Memory JSONL Capability Namespace

M36 adds namespace metadata to every memory JSONL operation descriptor.

## Problem

The memory JSONL plugin exposes a family of operation descriptors. They share ownership through `ownerPluginId`, but lacked a descriptor namespace for standard family-level filtering.

## Decision

Export `MEMORY_JSONL_OPERATION_NAMESPACE = "memory-jsonl"` and pass it to every `registerOperation()` call in `createMemoryJsonlPlugin()`.

## Why This Shape

- **Consistent discovery.** Skills and MCP already use namespace metadata; memory JSONL now follows the same descriptor convention.
- **Ownership stays separate.** `ownerPluginId` still identifies the contributing plugin instance; namespace groups related capabilities.
- **Names stay stable.** Capability ids are unchanged.
- **Low blast radius.** The change is descriptor metadata only.

## Verification

Focused tests assert the exported namespace constant and verify that both the storage descriptor and read-only projection descriptors include it.
