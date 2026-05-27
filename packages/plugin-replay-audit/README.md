# @guga-agent/plugin-replay-audit

Replay and audit projections for durable Guga sessions.

The plugin registers a replay capability through the normal plugin context. It derives conversation, model-input, and audit views from durable session facts instead of rerunning providers, tools, or hooks.

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createJsonlSessionPlugin } from "@guga-agent/plugin-session-jsonl";
import { createFilesystemArtifactPlugin } from "@guga-agent/plugin-artifact-filesystem";
import { createReplayAuditPlugin } from "@guga-agent/plugin-replay-audit";

const runtime = createAgentRuntime({
  plugins: [
    createJsonlSessionPlugin({ rootDir: ".guga/sessions" }),
    createFilesystemArtifactPlugin({ rootDir: ".guga/artifacts" }),
    createReplayAuditPlugin()
  ]
});
```

## Views

- `replayConversation` rebuilds branch-visible messages and reports dangling tool-call diagnostics.
- `replayModelInput` uses committed provider-input facts, projection records, source descriptors, policy decisions, provider-visible tool descriptors, artifact references, and projection hashes.
- `replayAudit` builds an ordered audit timeline for tools, permissions, hooks, context pressure, compaction, usage, provider errors, artifacts, branch lineage, interruptions, and corruption diagnostics.

Replay is non-mutating. Simulation replay or provider/tool reruns must be implemented as a separate future fork/trajectory flow.
