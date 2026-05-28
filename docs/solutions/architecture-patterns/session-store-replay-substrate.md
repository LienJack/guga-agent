# Session Store Replay Substrate

M5 turns Guga's in-memory runtime facts into a durable workbench substrate.

## Problem

Without durable session facts, recovery and replay are guesses. A long-running agent must know whether a run started, whether a model request responded, whether a tool executed, which permission decision happened, where large artifacts live, and which branch a user forked from.

## Decision

Add core persistence/replay contracts and first-party local plugins:

- durable event envelopes;
- `SessionStore`;
- `EventStore`;
- `ArtifactStore`;
- resume reports;
- session tree and fork lineage;
- replay/audit views;
- `@guga-agent/plugin-session-jsonl`;
- `@guga-agent/plugin-artifact-filesystem`;
- `@guga-agent/plugin-replay-audit`.

## Why This Shape

- **Events are facts.** Append-only event logs become the source of truth.
- **Artifacts keep blobs out of history.** Large outputs are referenced with metadata instead of blindly inlined.
- **Replay is non-mutating.** Conversation, model-input, and audit views are derived without rerunning providers or tools.
- **Resume is conservative.** Interrupted side effects are marked uncertain rather than assumed successful.
- **Memory is prepared, not implemented.** Future memory/search/RL projections can use provenance without becoming hidden state.

## Current Limits

- No remote sync.
- No multi-writer conflict resolution.
- No FTS/session search.
- No vector or graph memory.
- No simulation replay.
- No full privacy/retention UI.

## Verification

M5 is protected by JSONL store tests, corruption detection tests, session tree tests, artifact store tests, runtime integration tests, and replay/audit projection tests.
