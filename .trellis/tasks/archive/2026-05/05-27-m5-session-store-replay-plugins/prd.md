# brainstorm: M5 Session Store And Replay Plugins

## Goal

Implement M5 so Guga Agent can move from an in-memory loop to a durable workbench: sessions survive process restarts, historical nodes can be replayed or forked, and the same event substrate can later support Hermes-like long-term learning without turning memory into an opaque side channel.

## What I already know

* `docs/roadmap.md` defines M5 as Session Store And Replay Plugins.
* M5 scope includes `SessionStore`, `EventStore`, and `ArtifactStore` interfaces, append-only event log, session resume, fork/tree navigation, projection replay, and interrupted run detection.
* First-party M5 plugins are expected to include `plugin-session-jsonl`, `plugin-artifact-filesystem`, and `plugin-replay-audit`.
* M5 exit criteria require process restart resume, model input reconstruction, forking from a historical node, and append-only event history.
* `docs/roadmap.md` explicitly defers remote sync, full-text search, and multi-user collaboration from M5.
* `docs/agent-memo.md` recommends separating three concepts: durable session persistence, curated long-term memory, and retrieval/context injection.
* `docs/agent-memo.md` recommends treating original events as the source of truth and long-term memory as a governed projection over those events.
* `STRATEGY.md` says long-term memory or vector search should wait until session recovery, event log, and context projection are stable.
* Current repo already has M0-M4-oriented core packages for runtime, event bus, plugin host, hooks, tools, permissions, context projection, compaction, and context decision ledger.

## Assumptions (temporary)

* M5 should not directly ship a full semantic memory system, but it should create the stable substrate and hook points needed for a subsequent memory plugin.
* The MVP should bias toward local-first JSONL/filesystem plugins because remote sync and collaboration are explicitly out of scope.
* Projection replay should reuse existing context decision/projection concepts from M4 rather than inventing a parallel replay model.
* Hermes-like learning should be represented in the requirements as lifecycle contracts and follow-on plugin scope, not as unrestricted self-modifying behavior in core.

## Open Questions

* None currently.

## Requirements (evolving)

* Provide durable session/event/artifact contracts that can be implemented by first-party plugins.
* Persist runtime facts as append-only events rather than mutable transcripts.
* Require durable events to carry non-negotiable envelope fields: event id, schema version, session id, branch id, parent event id, stream revision or sequence, created_at, and actor/source.
* Require schema-versioned event evolution with additive compatibility/upcasters; normal operation must not rewrite historical events for new schema compatibility.
* Require event append idempotency or expected-revision protection so retries do not duplicate tool results, permission decisions, or projection records.
* Require artifact references to carry minimal verifiable metadata: artifact id, content hash, size, mime/type, and created_at.
* Support session resume after process restart.
* Support fork/tree navigation from historical nodes.
* Rebuild conversation, model input, and audit projections from persisted facts and recorded projection decisions.
* Detect interrupted runs and expose enough information for the host/UI to resume, fork, or mark abandoned.
* Preserve the boundary between session history and curated long-term memory.
* Record enough provenance for future memory extraction: event IDs, session/run/turn/tool correlation, source scope, timestamps, and projection decisions.
* Publish subscribable lifecycle events before compaction commit and on session switch/fork so future memory plugins can rescue facts and update session identity.
* Treat session/search/memory indexes as rebuildable projections over durable events, not as hidden sources of truth.
* Default replay to recorded decisions; do not rerun providers, tools, or mutating hooks unless a future simulation mode explicitly forks a new run.

## Acceptance Criteria (evolving)

* [ ] A session can be restarted from persisted storage without losing conversation/tool pairing invariants.
* [ ] Recovery from an unfinished tool call does not expose an illegal dangling tool-use chain to the provider.
* [ ] A historical turn can be replayed into the exact model input projection recorded for that turn.
* [ ] A fork can start from a historical node while preserving the original branch as append-only history.
* [ ] A fork before a compaction boundary can still reach the original pre-compaction event path, not only the summary.
* [ ] Audit replay can explain tool calls, permission decisions, hook decisions, compaction boundaries, and projection decisions for a run.
* [ ] Interrupted runs are detected after restart and surfaced as structured state.
* [ ] Completing a turn in M5 does not automatically write to curated memory files/stores; future memory writes require separate policy.
* [ ] First-party JSONL/filesystem plugins exercise the public store contracts without special core-only shortcuts.

## Definition of Done (team quality bar)

* Tests added/updated for core contracts, JSONL persistence, replay, resume, fork, and interrupted run behavior where appropriate.
* Lint / typecheck / CI green.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.

## Out of Scope (explicit)

* Remote session sync.
* Full-text search over sessions.
* Multi-user collaboration.
* Full vector memory, graph memory, or autonomous self-improvement loops.
* Multiple external memory providers writing concurrently.
* Rerunning side-effecting tools/providers during normal replay.

## Research References

* [`research/current-codebase-constraints.md`](research/current-codebase-constraints.md) — Guga already has typed runtime/context/audit events and projection hashes, but lacks durable store contracts, event envelopes, resume/fork identity, and serializable replay seams.
* [`research/session-replay-reference-patterns.md`](research/session-replay-reference-patterns.md) — Pi-style JSONL session trees are the closest M5 fit; Claude Code contributes recovery discipline; OpenCode informs replay/audit projections; Hermes search/memory should be a later projection.
* [`research/hermes-memory-learning-boundaries.md`](research/hermes-memory-learning-boundaries.md) — M5 should be memory-ready, not memory-driven: prepare provenance and lifecycle boundaries, defer `MEMORY.md`/`USER.md`, retrieval, FTS, graph/vector memory, and RL/self-improvement.
* [`research/event-sourcing-replay-best-practices.md`](research/event-sourcing-replay-best-practices.md) — Apply event-sourcing narrowly: versioned append-only envelopes, idempotent appends, deterministic projections, artifact indirection, corruption handling, and interrupted-run markers.

## Research Notes

### What similar tools do

* Pi persists a JSONL session tree with durable leaf/cursor entries, compaction entries, fork/clone/tree navigation, and full-history preservation.
* Claude Code uses append-only JSONL transcripts and puts complexity in recovery: metadata tail refresh, sidechains, link repair, interrupted turn detection, and runtime takeover.
* OpenCode treats UI clients as projections of server-side session state, which is useful for replay/audit presentation but not the local-first M5 storage core.
* Hermes combines curated memory files, memory provider lifecycle hooks, SQLite session/search, compression hooks, and offline RL tooling; these are powerful but mostly later projections over M5's substrate.

### Constraints from this repo

* Current `AgentEvent` coverage is broad enough to seed audit replay, but stored events need durable envelopes and JSON-safe payloads.
* Current `ContextDecisionLedger` and `ModelInputProjection` are the correct replay foundation, but they are in-memory and include some data that needs serializable descriptors for persistence.
* Current `ToolResultStore` proves the reference/preview pattern, but M5 needs a durable artifact store for cross-process replay.
* Current runtime starts each run with fresh conversation state and flat `runId`; M5 needs session identity, branch/leaf identity, and resumable state.

### Feasible approaches here

**Approach A: Strict Roadmap Substrate**

* How it works: implement only session/event/artifact stores, JSONL/filesystem plugins, resume, fork, projection replay, and interrupted detection.
* Pros: smallest scope, matches roadmap exactly, lowest risk.
* Cons: does not materially advance Hermes-like learning except by making it possible later.

**Approach B: Memory-Ready Substrate (Recommended)**

* How it works: deliver the roadmap substrate plus explicit provenance, replay-safe lifecycle events, session switch/fork/compaction boundaries, and memory/search/RL-ready event metadata.
* Pros: keeps M5 focused while ensuring the next memory milestone has real source-of-truth data; aligns with `docs/agent-memo.md` and Hermes lessons.
* Cons: slightly more contract work than strict substrate; requires careful scope policing so memory behavior does not leak into M5.

**Approach C: Memory MVP In M5**

* How it works: include basic curated memory files and simple extraction/injection in M5 alongside session store/replay.
* Pros: fastest visible path toward Hermes-like learning.
* Cons: conflicts with strategy/roadmap sequencing; risks mixing session recovery, memory governance, and prompt injection before the event substrate is proven.

## Decision (ADR-lite)

**Context**: M5 is the first durable substrate milestone after context projection. The user's long-term goal includes Hermes-like learning, but project strategy says long-term memory should wait until session recovery, event log, and context projection are stable.

**Decision**: Use Approach B, Memory-Ready Substrate.

**Consequences**: M5 will not ship user/profile memory, FTS, vector/graph retrieval, or self-improvement. It will, however, record the provenance, lifecycle, compaction, projection, and artifact references needed for those systems to be trustworthy later.

## Technical Notes

* Formal Chinese requirements doc: `docs/brainstorms/2026-05-27-m5-session-store-replay-plugins-requirements.md`.
* Roadmap reference: `docs/roadmap.md`.
* Prior memory research: `docs/agent-memo.md`.
* Product strategy reference: `STRATEGY.md`.
* Existing context/replay-adjacent code is under `packages/core/src/context/`, especially projection hashes, context decision ledger, compaction service, and model input projection.
* Existing runtime/event/plugin-host contracts are under `packages/core/src/runtime/`, `packages/core/src/events/`, `packages/core/src/contracts/`, and `packages/core/src/plugin-host/`.
