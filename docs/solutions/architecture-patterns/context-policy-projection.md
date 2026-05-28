# Context Policy Projection

M4 upgrades model input from a raw message array to an explainable projection.

## Problem

After M3, the agent can read files, run commands, inspect git, and accumulate large tool results. Passing `ConversationState.snapshot()` directly to the provider works for tiny runs, but fails for long tasks:

- token pressure grows quickly;
- old tool output pollutes current reasoning;
- user constraints can disappear during compression;
- tool-call pairing can break;
- hosts cannot explain exactly what the model saw.

## Decision

Add model-input projection and context policy plugin boundaries.

M4 owns:

- `ModelInputProjection`;
- context source descriptors;
- budget and pressure tracking;
- tool result previews and references;
- pairing safety;
- reactive/proactive compaction;
- post-compact reinjection;
- default context policy plugin;
- minimal context decision ledger.

## Why This Shape

- **Context is a projection.** It is assembled from typed sources, not equated with chat history.
- **Authority is visible.** System rules, user intent, tool output, summaries, and host context remain distinguishable.
- **Compression is safer.** Compaction protects pending turns, tool pairing, recent tail, and active task state.
- **Plugins can contribute policy.** Context behavior can evolve without making provider bridges assemble prompts.
- **M5 gets replay material.** Projection hashes, source lists, and decisions prepare durable model-input replay.

## Current Limits

- No long-term memory.
- No vector/session search.
- No full durable event store.
- No enterprise context governance product.
- No automated summary quality scoring.

## Verification

M4 is protected by projection, budget, truncation, compaction, pairing safety, reinjection, tool result view, and default context policy tests.
