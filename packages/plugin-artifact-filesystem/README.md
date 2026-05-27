# @guga-agent/plugin-artifact-filesystem

Filesystem-backed artifact storage for Guga runtimes.

The plugin registers an `ArtifactStore` through the normal plugin context. It stores large tool outputs and replay artifacts outside the event log while durable events keep bounded previews and verifiable artifact references.

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createFilesystemArtifactPlugin } from "@guga-agent/plugin-artifact-filesystem";

const runtime = createAgentRuntime({
  plugins: [createFilesystemArtifactPlugin({ rootDir: ".guga/artifacts" })]
});
```

## Behavior

- Artifact manifests include id, SHA-256 content hash, size, mime type, created time, privacy tags, retention, and redaction/tombstone state.
- Reads verify content hash before returning content.
- Missing, hash-mismatched, and tombstoned artifacts return structured diagnostics.
- Tombstone/redaction transitions are recorded in versioned manifest history.
- `ArtifactToolResultStore` can back `ResultPolicy` so model-visible previews stay bounded while audit metadata keeps the full reference.

This package does not automatically persist raw provider payloads. Hosts must opt into any raw payload artifact policy separately.
