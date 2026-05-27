# Current Codebase Constraints: M5 Session Store And Replay Plugins

## Summary

Guga core already emits rich in-memory runtime facts through `AgentEvent`, and M4 introduced explicit model input projections, projection hashes, compaction boundaries, and context decision ledger entries. M5 should build on these contracts instead of inventing a parallel transcript model.

The main gap is durable identity and storage: there is no `SessionStore`, `EventStore`, or `ArtifactStore`; events are not wrapped in append-only envelopes; plugins cannot register persistence backends; and runtime cannot resume or fork from persisted state.

## Existing Contracts To Reuse

* `packages/core/src/contracts/events.ts` defines the main audit facts.
* `packages/core/src/contracts/runtime.ts` exposes `runId`, `events`, and `onEvent()`.
* `packages/core/src/contracts/context.ts` defines `ModelInputProjection`, `ProjectionLedgerEntry`, `CompactionBoundary`, source refs, and projection hashes.
* `packages/core/src/context/context-decision-ledger.ts` provides an in-memory projection ledger.
* `packages/core/src/context/tool-result-store.ts` provides an in-memory tool-result reference store that can inform `ArtifactStore`.
* `packages/core/src/contracts/tool-runtime.ts` defines `ToolCallCorrelation`.
* `packages/core/src/contracts/plugins.ts` is the plugin capability registration surface.

## Missing Store Seams

* Add public `SessionStore`, `EventStore`, and `ArtifactStore` contracts.
* Add store registration to `PluginContext`.
* Extend `PluginCapabilityKind` for `session-store`, `event-store`, and `artifact-store`.
* Add store injection to `AgentRuntimeOptions`.
* Add durable event envelope fields: event id, session id, run id, branch id, parent event id, sequence, created timestamp, and schema version.
* Ensure persisted events are JSON-safe; avoid serializing `ToolDefinition.execute`, `Error`, `AbortSignal`, or arbitrary `unknown` details directly.

## Replay Decisions Already Present

* `AgentLoop` creates `context.projection.created` before every provider request.
* `ModelInputProjector` creates `ModelInputProjection` and projection hash.
* `ContextDecisionLedger` records projection source refs, descriptors, policy decisions, compaction boundary, and hash.
* Compaction produces structured summaries and explicit boundaries.
* Tool, permission, hook, usage, provider, and error events are already typed enough for audit replay.
* Replay should reconstruct projections from persisted events and compare against recorded projection hashes.

## Risks

* Append-only JSONL will fail unless events are normalized into a serializable durable envelope.
* Resume needs a way to hydrate `ConversationState`, context ledger, artifact refs, and permission/session state.
* Fork needs session tree fields; current `runId` is flat.
* Interrupted detection needs consistent lifecycle rules for `run.started` and `run.finished`.
* Exact projection replay needs serializable tool metadata, not executable tool definitions.
* Artifacts need durable content-addressed storage; current tool result buffering is memory-only.
* Model request/response hooks are typed but not currently executed by `AgentLoop`.

## Implementation Guidance

Start with contracts and a first-party JSONL/filesystem implementation. Keep core store-agnostic, but make persistence part of runtime construction so tests can run resume, fork, replay, and interrupted-run detection through public plugin contracts.

