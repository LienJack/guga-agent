# Session Replay Reference Patterns

## 一句话结论

M5 should make the append-only event/session log the source of truth: persist every accepted mutation, rebuild runtime projections by replay, support tree/fork navigation with durable leaf entries, and mark interrupted operations conservatively rather than pretending provider streams can resume.

## 项目对比

| Project | Pattern | Evidence | Guga Takeaway |
| --- | --- | --- | --- |
| Pi | JSONL session tree with `id`/`parentId`, durable `leaf` entries, `/tree`, `/fork`, `/clone`, compaction entries | Fact | Best direct fit for M5: local-first, append-only, branchable, replayable |
| Claude Code | Per-session append-only JSONL transcript plus metadata re-append, sidechains, remote ingress, heavy resume repair | Fact | Copy the recovery invariants, not the full complexity |
| OpenCode | Server-owned session state, SQLite/sync events, REST + SSE, JSON Patch/client mirror, session fork/revert endpoints | Fact | Good model for replay/audit UI and plugin/event API |
| Hermes | SQLite SessionDB + JSONL fallback, parent session chains on compression, FTS5 search, restart auto-continue after tool result | Fact | Defer search/memory, but design M5 events so SessionDB can be a projection later |

## 可借鉴模式

1. **Append-only event/session log as source of truth**

   Pi stores sessions as JSONL entries with `id` and `parentId`; Claude Code uses append-only JSONL transcripts; both push complexity into replay/recovery instead of mutable snapshots.

   Evidence: Fact.

2. **Durable tree cursor, not in-memory branch state**

   Pi persists active navigation using `leaf` entries. Reopening storage reconstructs the current leaf from the latest leaf-affecting entry.

   Evidence: Fact.

3. **Fork without mutating history**

   Pi supports in-place branching in one file and also fork/clone into a new session file. OpenCode exposes session fork; Hermes uses `parent_session_id` for session lineage.

   Evidence: Fact.

4. **Compaction as an entry/boundary, not deletion**

   Pi and Claude Code keep full history while inserting compaction summaries or boundaries. Hermes splits sessions on compression so old content remains searchable.

   Evidence: Fact.

5. **Interrupted runs must be first-class**

   Pi design notes say provider streams are not resumable; default recovery marks unfinished turns/provider requests interrupted. Hermes detects a transcript ending in a tool result after restart and injects a continuation note. Claude Code detects interrupted turns during resume.

   Evidence: Fact.

6. **Replay/audit views should be projections**

   OpenCode's server-driven push model treats UI as a mirror of backend state via REST/SSE/events. Guga can build `plugin-replay-audit` as a projection over durable events: messages, tools, permissions, hooks, compaction, projection decisions.

   Evidence: Fact + Inference.

## 不建议照搬

* Do not adopt Claude Code's full remote ingress/sidechain system in M5; it is powerful but beyond local-first scope.
* Do not make Hermes SessionDB the primary M5 store; FTS5/search is explicitly deferred, and SQLite can be a later projection.
* Do not model OpenCode's frontend mirror as the persistence layer; it is a presentation/sync architecture.
* Do not auto-rerun unfinished tools unless tools declare idempotence/retry safety.

## Guga 落点

Recommended M5 shape:

* `EventStore`: append-only JSONL records with stable event id, session id, run id, turn id, parent event id, timestamps, and typed payloads.
* `SessionStore`: session metadata plus branch/tree operations over event IDs.
* `ArtifactStore`: large blobs by content-addressed reference, with event records pointing to artifacts.
* Durable event types: `session.created`, `run.started`, `turn.started`, `message.appended`, `tool.call.started`, `tool.call.finished`, `permission.decided`, `hook.decided`, `projection.recorded`, `compaction.appended`, `leaf.moved`, `fork.created`, `operation.interrupted`.
* Resume flow: read log -> validate schema -> rebuild tree/leaf -> repair/filter illegal tool pairings -> detect unfinished operations -> mark or continue from durable boundary -> rebuild model input projection.
* Fork flow: create new session metadata with parent session id / forked-from event id; copy or reference the selected path; never rewrite source history.
* Replay audit: derive timelines from events, not from current runtime state.

## 证据

* Fact: Pi README/session docs describe JSONL session trees, tree/fork/clone flows, and compaction preserving full history. Source: `docs/research/repomix/pi-focused-context.xml`.
* Fact: Pi storage appends JSONL entries and persists `leaf` cursor entries. Source: `docs/research/repomix/pi-focused-context.xml`.
* Fact: Pi durable harness notes recommend reducing the session log on recovery and marking unfinished provider/tool work interrupted unless safe. Source: `docs/research/repomix/pi-focused-context.xml`.
* Fact: Claude Code session storage uses append-only JSONL, metadata tail re-append, sidechains, resume repair, interrupt detection, and runtime state takeover. Source: `docs/research/source-analysis/claude-code-analysis/analysis/04i-session-storage-resume.md`.
* Fact: OpenCode exposes session REST APIs including fork/revert/abort and uses sync events plus SSE/client mirror. Sources: `docs/research/source-analysis/learn-opencode/docs/internals/session.md`, `docs/research/source-analysis/learn-opencode/docs/flow/state_sync.md`, `docs/research/repomix/opencode-context.1.xml`.
* Fact: Hermes SessionStore uses SQLite + JSONL fallback, SessionDB/FTS5, compression session lineage, and restart auto-continue for histories ending in tool results. Sources: `docs/research/source-analysis/hermes-wiki/concepts/session-search-and-sessiondb.md`, `docs/research/source-analysis/hermes-agent-anatomy/docs/05-上下文压缩.md`, `docs/research/source-analysis/hermes-wiki/concepts/interrupt-and-fault-tolerance.md`.

