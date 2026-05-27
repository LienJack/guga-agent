# Memory JSONL Audit Snapshot Capability

M32 exposes the durable memory audit bundle as a discoverable read-only capability.

## Problem

M29 added `JsonlMemoryStore.readAuditSnapshot()`, but host inspection surfaces still could not discover that bundle through runtime capability listing.

## Decision

Register `memory.jsonl.audit_snapshot` from `createMemoryJsonlPlugin()`.

The descriptor:

- is an `operation`;
- is owned by the memory JSONL plugin;
- uses `source: "plugin"`;
- carries first-party read-only memory trust;
- does not add tool execution behavior.

## Why This Shape

- **Inspection-friendly.** Workbenches can discover a full audit bundle without probing store methods.
- **Clear trust boundary.** The snapshot observes durable state; it does not mutate memory.
- **Consistent projection surface.** Audit snapshot now sits beside review, health, retrieval, and curated Markdown.
- **Small runtime footprint.** Discovery improves without adding new host commands or model-callable tools.

## Verification

The plugin descriptor test covers `memory.jsonl.audit_snapshot` with the same read-only ownership assertions as the other projection descriptors.
