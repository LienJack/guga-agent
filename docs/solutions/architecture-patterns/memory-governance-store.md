# Memory Governance Store

M16 turns memory candidates into reviewable active memory items without adding automatic memory writes.

## Problem

M15 made memory candidates safe and auditable, but a candidate is still only a proposal. Hosts need a separate trail for the decision that promotes, rejects, or supersedes a candidate.

Without that decision layer, memory can quietly become a status flag on a blob of text. That makes it hard to explain who accepted it, why it was accepted, what it replaced, and whether it should still be active.

## Decision

Extend `@guga-agent/plugin-memory-candidates` with a pure governance projection.

The package now exports:

- `MemoryDecision`
- `GovernedMemoryItem`
- `validateMemoryDecision()`
- `createMemoryGovernanceLedger()`
- `listMemoryItemsByScope()`
- `renderGovernedMemoryBlock()`
- `createMemoryGovernancePlugin()`

## Why This Shape

- **Decisions are separate from candidates.** A candidate can exist without becoming memory.
- **Acceptance is explicit.** Active memory items come from accept/supersede decisions, not from ad hoc mutation.
- **Reject can correct prior promotion.** Chronological decisions let a later reject remove an earlier active item for the same candidate.
- **Supersede keeps history.** Replaced items stay visible as `superseded` when requested.
- **Safety is rechecked.** Projection rescans candidate content before creating active items.
- **Listing is scope-bound.** Hosts request memories by explicit scope and optional kind/tags.

## Current Limits

- No automatic extraction.
- No persistent memory backend.
- No vector or graph retrieval.
- No model-request injection.
- No prompt rewrite in core.

## Verification

Focused tests cover:

- accept decision projection;
- reject-after-accept behavior;
- supersede projection;
- malformed decision diagnostics;
- unsafe candidate denial;
- scope filtering and bounded rendering;
- operation descriptor registration.
