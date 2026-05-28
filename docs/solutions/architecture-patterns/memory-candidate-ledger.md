# Memory Candidate Ledger

M15 adds the first memory-facing package without turning Guga into an automatic long-term memory system.

## Problem

Memory is risky because it can quietly become a second source of truth. If an agent automatically writes or injects memory without provenance and policy, the runtime can no longer explain why the model saw a fact.

Guga already has durable session events and replay. M15 uses that foundation by making memory a governed projection candidate over events, not a replacement for events.

## Decision

Create `@guga-agent/plugin-memory-candidates`.

The package exports:

- `createMemoryCandidate()`
- `createMemoryCandidateLedger()`
- `validateMemoryCandidate()`
- `scanMemoryCandidateContent()`
- `renderMemoryContextBlock()`
- `createMemoryCandidatesPlugin()`

## Why This Shape

- **Candidates are not committed memory.** `proposed`, `accepted`, and `rejected` are explicit statuses.
- **Every candidate has provenance.** `sourceRefs` point back to session/event/run/turn/artifact references.
- **Safety is typed.** Content is scanned for prompt-injection-like phrases, invisible controls, and excessive length.
- **Rendering is filtered.** Only accepted safe candidates enter the rendered context block.
- **Core stays untouched.** Memory behavior is a first-party package and plugin operation descriptor.

## Current Limits

- No automatic extraction.
- No memory file writes.
- No vector or graph store.
- No retrieval or reranking.
- No runtime prompt injection.
- No provider calls.

## Verification

Focused tests cover:

- candidate validation;
- safety scanning;
- deterministic ledger ordering;
- status counts and diagnostics;
- accepted-safe-only rendering;
- operation descriptor registration.
