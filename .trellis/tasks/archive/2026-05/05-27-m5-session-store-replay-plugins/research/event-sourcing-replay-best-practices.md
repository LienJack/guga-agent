# Event Sourcing And Replay Best Practices For Guga M5

## 一句话结论

For Guga M5, use event sourcing narrowly: make the runtime's durable facts append-only, then rebuild conversation/model-input/audit views from those facts. Do not turn M5 into a broad business event-sourcing framework or long-term memory system.

## Recommended Shape

* `EventStore` is the source of truth: append-only session/run/turn/tool/context/plugin events.
* `SessionStore` is an indexed navigation layer over event streams: current leaf, branch tree, resume candidates.
* `ArtifactStore` holds large/private/mutable payloads by content hash or stable artifact ID; events only keep references.
* `plugin-session-jsonl` should be the local-first MVP: one JSONL stream per session, UTF-8, one valid JSON object per line, newline-terminated.
* `plugin-artifact-filesystem` should write blobs separately with durable metadata such as id, hash, size, mime, created time, and privacy tags.
* `plugin-replay-audit` should rebuild projections without rerunning side-effecting hooks, providers, or tools unless explicitly in simulation mode.

## Event Envelope

Each stored event should carry an envelope independent of its payload:

* event id
* event type
* schema version
* stream id
* stream revision
* session id
* branch id, when applicable
* parent event id, when applicable
* causation/correlation ids, when applicable
* run id, turn, and attempt, when applicable
* plugin id, when applicable
* timestamp
* payload
* payload hash
* previous event hash, when available
* artifact refs
* privacy tags

Use expected revision and deterministic event ids / idempotency keys on append so retries do not duplicate tool results, permission decisions, or projection records.

## Schema Versioning

Prefer additive event changes. Never rewrite historical events during normal operation. Put schema version in the envelope and use upcasters at read/replay time. Only do in-place migrations for unrecoverable local development formats, and require a backup or quarantine path.

Version event meaning, not just TypeScript types. An explicitly versioned new event semantic contract is better than silently changing the meaning of an existing event.

## Deterministic Replay

Replay must rebuild what happened, not ask the model to happen again.

* Conversation view: user/assistant/tool events with tool-call/result pairing repaired or flagged.
* Model input view: recorded model input projection, source descriptors, policy decisions, token estimate, tool list, and projection hash.
* Audit view: permission decisions, hook decisions, compaction boundaries, budget/truncation decisions, artifact refs.

Provider calls, tool execution, and mutating hooks are side effects. During replay, consume recorded events and decisions. A separate simulation replay mode may rerun providers/tools, but its output must be recorded as a new fork, not overwrite history.

## Projections

Treat projections as rebuildable caches. Store enough projection metadata to explain and verify the view:

* source event IDs and artifact refs
* policy decisions and hook decisions
* compaction boundary and retained/cutoff event IDs
* projection hash
* projection schema version

Projection handlers must be idempotent and checkpoint by last processed stream revision or event id. Rebuild by clearing the projection and replaying the event stream from zero.

## Snapshots Vs Logs

Snapshots are optimization only. The log remains truth.

Useful snapshots for M5:

* latest session tree/index
* latest conversation state
* latest projection ledger index
* latest artifact manifest index

Snapshot records should include source stream id, through revision, schema version, and hash. If a snapshot fails validation, discard it and replay from the log.

## Artifact Indirection

Do not store large tool output, files, screenshots, provider raw payloads, or sensitive blobs inline in session events. Store them as artifacts and put bounded previews in events.

Artifact refs should include artifact id, hash, size, mime, created time, retention, and optional redaction state. This aligns with current Guga M4 tool-result-view work: raw result, LLM preview, UI projection, and audit metadata are different views.

## Corruption Handling

For JSONL:

* append through a single per-stream writer queue
* use newline-terminated JSON values
* optionally fsync/flush at run or turn boundaries
* include per-event hash and optional previous-event hash
* on read, accept the longest valid prefix and quarantine the corrupt tail
* emit a store corruption event and require explicit repair/truncate action

Local JSONL is simpler than SQLite for M5, but SQLite WAL is a strong later option if Guga needs concurrent readers, secondary indexes, or stronger transaction ergonomics.

## Interrupted Runs

Persist lifecycle markers before and after long-running phases:

* `run.started` / `run.finished`
* `turn.started` / `turn.finished`
* `model.requested` / `model.responded` / `model.failed`
* `tool.started` / `tool.completed|failed|cancelled|timeout`
* `context.compact.started` / `context.compact.completed|failed`

On startup, scan for runs with open markers. Surface them as interrupted, not failed. The host should offer resume, fork, or mark abandoned. Resume should continue from the last complete deterministic boundary; uncertain in-flight tool/model effects should be represented as unknown and require policy.

## Privacy And Delete Semantics

Immutable logs conflict with deletion requirements, so design privacy boundaries now:

* Avoid storing secrets/PII inline when an artifact ref or redacted preview is enough.
* Use privacy tags on events and artifacts.
* Deleting user-visible content should append tombstone/redaction events.
* For hard delete, delete artifact bytes and rebuild projections so previews disappear.
* For data that may require true erasure, use envelope encryption per session/artifact; deleting the key gives practical cryptographic erasure while preserving non-sensitive audit structure.
* Long-term memory must remain a governed projection over session events, not a second hidden source of truth.

## Guga M5 Contract Recommendations

* Add append/read stream behavior with expected revision and idempotency support.
* Add session tree, branch, active leaf, and resume-candidate operations.
* Add artifact put/read/delete/tombstone behavior with hash validation.
* Persist current context decision ledger entries as events.
* Persist projection hashes and source refs for every model request.
* Make plugin hook replay default to recorded decisions; rerun only if hook declares deterministic and side-effect-free.
* Keep M5 out of full-text search, remote sync, multi-user merge, and semantic memory.

## Sources Used

* `docs/roadmap.md`
* `.trellis/tasks/05-27-m5-session-store-replay-plugins/prd.md`
* `docs/research/context-packs/agent-loop.md`
* `docs/research/context-packs/tool-registry.md`
* `docs/research/context-packs/context-compression.md`
* `docs/research/context-packs/memory-systems.md`
* Microsoft Event Sourcing pattern
* Node.js filesystem documentation
* SQLite atomic commit and WAL documentation
* JSON Lines specification

