# @guga-agent/plugin-replay-audit Usage

## Purpose

`@guga-agent/plugin-replay-audit` derives replay and audit views from durable session, event, and artifact facts. It rebuilds conversation, model-input, and audit projections without rerunning providers, tools, or hooks.

## Import

```ts
import {
  ReplayAuditProjectionCapability,
  buildAuditView,
  buildConversationView,
  buildModelInputView,
  createReplayAuditPlugin
} from "@guga-agent/plugin-replay-audit";
```

## Main APIs

- `createReplayAuditPlugin(options)`: registers a replay capability with the runtime.
- `ReplayAuditProjectionCapability`: direct replay capability wrapper around stores.
- `buildConversationView(options)`: reconstructs branch-visible conversation messages.
- `buildModelInputView(options)`: reconstructs provider-visible model input from committed facts.
- `buildAuditView(options)`: builds an ordered audit timeline.
- Types: `ReplayAuditPluginOptions`, `ReplayAuditStores`, `ConversationViewResult`, `ModelInputViewResult`, `AuditViewResult`, and `BranchReplayView`.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [
    createJsonlSessionPlugin({ rootDir: ".guga/sessions" }),
    createFilesystemArtifactPlugin({ rootDir: ".guga/artifacts" }),
    createReplayAuditPlugin()
  ]
});
```

Advanced hosts can construct `ReplayAuditProjectionCapability` directly when they already manage stores.

## Parameters

- `createReplayAuditPlugin(options)` accepts optional `eventStore`, `sessionStore`, `artifactStore`, and `pluginId`. If stores are omitted, the plugin tries to read them from the runtime context; replay requires an event store to produce views.
- `new ReplayAuditProjectionCapability(stores)` accepts the same optional stores directly. `eventStore` supplies durable event paths, `sessionStore` enables branch-aware replay, and `artifactStore` enables artifact verification diagnostics.
- `buildConversationView(events)` requires durable event envelopes and rebuilds branch-visible user, assistant, and tool messages from committed facts.
- `buildModelInputView(events, request)` requires durable event envelopes. Optional `request.turn` selects a specific provider-input turn; omit it to use the latest committed provider input.
- `buildAuditView(options)` requires `events`. Optional `branch` adds branch metadata to the result, `artifactStore` verifies referenced artifacts, and `readDiagnostics` carries store corruption diagnostics into the audit view.

## Notes

- Replay is non-mutating and does not simulate or rerun model/tool behavior.
- Without an event store, replay reports unavailable.
- Without a session store, branch-aware views fall back to main/default branch assumptions.
- Audit views include diagnostics for open runs, open tools, open model requests, open permissions, compaction, artifact verification, and related durable facts.

## Related Packages

- `@guga-agent/core` defines replay contracts.
- `@guga-agent/plugin-session-jsonl` provides local durable event/session stores.
- `@guga-agent/plugin-artifact-filesystem` provides artifact reads for audit views.
