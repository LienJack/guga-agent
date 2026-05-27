# Build Agent From Zero: M5 Session Store And Replay

M5 is the point where an agent stops being a clever in-memory loop and starts becoming a durable workbench.

Before this module, Guga could run turns, call tools, manage permissions, and project context. But if the process died, the real history of the work was fragile. The model's next input, the tool results, the permission decisions, the compaction boundary, and the branch a user wanted to continue from all needed a stronger source of truth.

## The Problem

An agent session is not just a chat transcript.

It contains runtime facts:

- a session exists;
- a run started;
- a model request was made;
- a tool call began;
- a permission decision happened;
- a large output was stored somewhere else;
- a context projection was assembled;
- a branch forked from an older point;
- a run was interrupted before it reached a terminal marker.

If those facts live only in memory, replay and recovery are mostly theater. The system can show something that looks like history, but it cannot prove what happened.

## The Move

M5 introduces the durable substrate:

- `SessionStore`
- `EventStore`
- `ArtifactStore`
- durable event envelopes
- resume reports
- session tree and fork contracts
- replay views

The first-party proof comes through local plugins:

- `@guga-agent/plugin-session-jsonl`
- `@guga-agent/plugin-artifact-filesystem`
- `@guga-agent/plugin-replay-audit`

The shape is deliberately local-first. JSONL is easy to inspect, easy to test, and good enough to prove the contract.

## Events Are The Source Of Truth

The most important decision in M5 is that durable events become the source of truth.

Snapshots and indexes can help performance, but they cannot replace the append-only log. The reason is simple: recovery needs causality.

When a run is half-finished, the system needs to distinguish:

- did the model request start?
- did it respond?
- did the tool execute?
- did permission resolve?
- did compaction commit?
- did the terminal marker persist?

Those are not vibes. They are facts.

## Artifacts Keep Context Honest

Tool output can be huge. A test log, file content, search result, or provider payload should not always be copied into every event or prompt.

M5 separates the event from the blob.

The event can keep a bounded preview and a reference. The artifact store keeps the larger payload with hash, size, MIME/type, and governance metadata.

That gives future UI, replay, audit, and eval flows a stable way to answer two different questions:

- what did the model see?
- where is the complete underlying material?

Those are not the same question.

## Replay Does Not Rerun The World

Replay is easy to get wrong.

The tempting version reruns the provider or re-executes tools to "recreate" the session. That is dangerous. Tools have side effects. Providers are nondeterministic. The current filesystem may not match the old filesystem.

M5 defines replay as projection from recorded facts.

The replay/audit plugin derives:

- conversation view;
- model input view;
- audit timeline.

It does not rerun providers, tools, or mutating hooks. Simulation replay can exist later, but it must be a new fork or trajectory, not a rewrite of history.

## Resume Is Conservative

Interrupted work is unavoidable in long-running agents.

The hard part is not detecting that something stopped. The hard part is refusing to pretend that an uncertain side effect succeeded.

M5 treats unfinished provider requests, tool executions, mutating hooks, and compactions conservatively. It marks the boundary as interrupted or repair-required and lets the host decide what to do next.

That conservatism is what makes recovery trustworthy.

## Why This Is Not Memory Yet

M5 prepares the ground for memory, but it is not a memory system.

That boundary matters. Long-term memory, session search, semantic retrieval, and training data export should all be projections over durable facts. They should not become hidden side channels that quietly mutate the agent's truth.

M5's job is to make future memory possible:

- provenance is recorded;
- session lineage is visible;
- compaction boundaries are known;
- model inputs can be replayed;
- artifacts remain addressable.

Only after that should memory start extracting durable claims.

## Result

M5 gives Guga a durable workbench spine.

The agent can now recover, fork, replay, audit, and explain what happened without depending on whatever happens to be in RAM. That is the difference between an impressive demo and a system that can survive real work.
