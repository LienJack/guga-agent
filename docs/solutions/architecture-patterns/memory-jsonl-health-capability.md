# Memory JSONL Health Capability

M31 exposes durable memory health as a discoverable plugin capability.

## Problem

M30 gave `JsonlMemoryStore` a compact health Markdown reader, but host surfaces still had no descriptor-level way to discover that durable health projection exists.

## Decision

Register `memory.jsonl.health` from `createMemoryJsonlPlugin()`.

The descriptor:

- is an `operation`;
- is owned by the memory JSONL plugin;
- uses `source: "plugin"`;
- carries first-party read-only memory trust;
- does not add an execution handler.

## Why This Shape

- **Discoverability without coupling.** Hosts can check capability descriptors instead of probing store methods.
- **Authority stays clear.** `memory.jsonl` remains the read/write storage capability; health is read-only.
- **Small follow-up.** The descriptor aligns M30 with the existing M28 projection surface.
- **No runtime expansion.** Discovery changes do not imply new tool execution behavior.

## Verification

The plugin descriptor test now covers `memory.jsonl.health` alongside review, retrieval, and curated Markdown projection descriptors.
