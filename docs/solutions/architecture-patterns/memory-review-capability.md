# Memory Review Capability

M21 exposes memory review as a discoverable read-only capability.

## Problem

M20 added a typed memory review report, but hosts still needed a standard capability descriptor to discover that audit surface.

## Decision

Add `createMemoryReviewPlugin()` to `@guga-agent/plugin-memory-candidates`.

The plugin registers:

- operation name: `memory.review`;
- source: `plugin`;
- owner plugin id: configurable;
- trust: first-party;
- scope: memory read-only.

## Why This Shape

- **Discovery without execution.** Hosts can see that review exists without receiving a tool that mutates memory.
- **Consistent memory surface.** Candidates, governance, and review now all expose operation descriptors.
- **Read-only trust.** The descriptor communicates audit intent and avoids accidental write authority.

## Verification

Focused tests prove the descriptor appears in runtime capability discovery with source, owner, first-party trust, and memory read-only scope.
