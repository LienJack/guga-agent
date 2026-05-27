# Hermes Memory And Learning Boundaries For M5

## One-Line Decision

`Inference`: M5 should make Guga memory-ready, not memory-driven. Ship durable session/event/replay contracts and provenance hooks now; defer curated memory, FTS/session search, vector/graph retrieval, and self-improvement/RL to later milestones.

## Evidence Funnel

`Fact`: Layer 1 context packs and `docs/agent-memo.md` already establish the key split: session persistence, curated long-term memory, and retrieval/context injection are separate concerns.

`Fact`: Hermes anatomy confirms a richer product-state design: builtin `MEMORY.md` / `USER.md`, `MemoryManager` provider orchestration, SQLite `SessionDB` with FTS5, compression/session lifecycle hooks, and separate RL trajectory tooling.

`Fact`: `docs/research/repomix/hermes-agent-focused-context.xml` confirms `agent/memory_manager.py` exposes one integration point with builtin plus at most one external provider, `build_system_prompt`, `prefetch_all`, `sync_all`, `queue_prefetch_all`, `on_pre_compress`, and session lifecycle handling.

`Pending Verification`: No checked-in Hermes Graphify / Understand-Anything graph was found in this repo, so Layer 2/3 confirmation was unavailable. Focused repomix and source-analysis were enough for M5 boundary decisions.

## Hermes Patterns Worth Preparing For

`Fact`: Hermes builtin memory is file-backed: `MEMORY.md` for agent notes and `USER.md` for user profile. The loaded snapshot is used for system prompt stability, while writes update disk for later sessions.

`Inference`: Guga should not make M5 memory files part of core. If prepared at all, M5 should preserve enough event provenance for a later memory-file projection: source event IDs, actor, scope, timestamp, branch/session lineage, and projection decision IDs.

`Fact`: Hermes `MemoryManager` broadcasts lifecycle hooks across providers and isolates provider failures so one backend does not break the agent loop.

`Inference`: M5 should define durable hook/event boundaries, not full provider behavior:

* `SessionStarted`
* `SessionResumed`
* `SessionForked`
* `SessionSwitched`
* `TurnStarted`
* `TurnCompleted`
* `CompactionPlanned`
* `CompactionCommitted`
* `ProjectionBuilt`
* optional future `MemoryCandidateProposed`

`Fact`: Hermes `prefetch` runs before model calls, `sync_turn` runs after completed turns, `on_pre_compress` lets providers rescue facts before compaction, and `on_session_switch` keeps providers aligned when session identity changes.

`Inference`: For M5, only `on_pre_compress` and `on_session_switch` need first-class preparation because they intersect directly with replay, fork, resume, and compaction events. `prefetch` and `sync_turn` can be later memory-plugin hooks.

## SessionDB / FTS Boundary

`Fact`: Hermes `SessionDB` uses SQLite, WAL, FTS5, parent session chains, and session search for historical recall.

`Inference`: Guga M5 should not ship FTS. M5 should make FTS possible later by treating session history as append-only source-of-truth events and allowing search indexes as rebuildable projections.

M5 should prepare:

* Append-only event log.
* Stable event IDs and parent/branch lineage.
* Tool call/result pairing metadata.
* Compaction boundary events.
* Projection hashes / replay inputs.
* Interrupted run markers.

M5 should defer:

* SQLite FTS5 index.
* Session search UI/tool.
* CJK/tokenizer-specific search behavior.
* Auto-prune/vacuum policy.

## Safety Around Memory Writes

`Fact`: Hermes scans memory content for prompt-injection-like patterns and invisible Unicode before injecting memory into prompts; memory writes are atomic and lock-protected.

`Inference`: Guga should treat memory writes as governed projections, not normal session events. The event log may record that a memory write was proposed or committed, but curated memory state should be a separate projection with policy gates.

M5 should prepare:

* Record source event IDs for any future memory candidate.
* Preserve actor/source scope: user, assistant, tool, hook, plugin.
* Keep original events immutable.
* Record projection decisions and compaction summaries separately.
* Allow future plugins to attach safety verdicts without mutating history.

M5 should defer:

* Automatic memory extraction.
* User profile updates.
* Cross-session memory injection.
* Multiple external memory providers writing concurrently.

## Why Self-Improvement / RL Is Not M5

`Fact`: Hermes RL is a separate research/data pipeline: trajectory saving, batch generation, trajectory compression, and training integration. It is not required for session recovery or replay.

`Fact`: Hermes batch trajectory generation explicitly skips persistent memory in clean training runs, showing RL data production has different isolation requirements than normal user sessions.

`Inference`: Putting self-improvement in M5 would blur three contracts at once: durable replay, memory governance, and model-training data generation. That would make replay harder to trust.

M5 should prepare:

* Make trajectories reconstructable from events.
* Preserve model input projections exactly enough for audit/replay.
* Store tool outcomes and permission decisions as events.
* Keep enough metadata for future offline dataset export.

M5 should defer:

* RL trajectory compression.
* Batch runner / data factory.
* Autonomous skill creation.
* Background self-review loops.
* Any mechanism that changes agent behavior based on its own generated history without explicit policy.

## M5 Boundary Recommendation

`Fact`: Current M5 scope already includes `SessionStore`, `EventStore`, `ArtifactStore`, append-only history, resume, fork/tree navigation, projection replay, and interrupted run detection.

`Inference`: The clean M5 contract is: durable events are source of truth; memory/search/learning are later projections over those events.

M5 should include:

* Event schema fields needed by future memory: event id, session id, branch id, turn id, run id, actor, scope, timestamp, source event ids.
* Replayable projection records for model input reconstruction.
* Compaction events that preserve original event ranges and summary provenance.
* Session switch/fork/resume events visible to future plugins.
* Audit plugin support for explaining hook, permission, tool, compaction, and projection decisions.

M5 should defer:

* `MEMORY.md` / `USER.md` implementation.
* `MemoryManager` provider runtime.
* `prefetch` retrieval and prompt injection.
* `sync_turn` writes to memory backends.
* `SessionDB` FTS/search.
* Vector/graph memory.
* Self-improvement/RL loops.

## Evidence

`Fact`: Used `docs/agent-memo.md`, `docs/research/context-packs/memory-systems.md`, `docs/research/context-packs/context-compression.md`, Hermes anatomy docs `07-Memory与RL训练.md`, `05-上下文压缩.md`, `01-全景图.md`, `08-三方对比.md`, plus `docs/research/repomix/hermes-agent-focused-context.xml`.

