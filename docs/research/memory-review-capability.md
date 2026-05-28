# Memory Review Capability

Date: 2026-05-28

## 一句话结论

M21 should expose memory review as a discoverable read-only operation descriptor, not as an executable mutation path.

## Evidence

- `Fact`: M15 and M16 expose `memory.candidates` and `memory.governance` capability descriptors.
- `Fact`: M20 adds pure review report helpers but no plugin-owned descriptor.
- `Inference`: Hosts need capability discovery to know that memory audit views exist, while execution can remain host-owned for now.

## Guga Landing

Add `createMemoryReviewPlugin()` to `@guga-agent/plugin-memory-candidates`.

The plugin should register:

- `type`: operation
- `name`: `memory.review`
- `source`: plugin
- `ownerPluginId`: configurable plugin id
- `trust`: first-party, memory read-only

## Guardrails

- Descriptor only; no callable tool.
- Read-only scope only.
- No storage or prompt-context side effects.
