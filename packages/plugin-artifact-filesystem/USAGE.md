# @guga-agent/plugin-artifact-filesystem Usage

## Purpose

`@guga-agent/plugin-artifact-filesystem` provides a filesystem-backed `ArtifactStore` for Guga runtimes. It stores artifact content on disk, records manifests, verifies hashes on reads, and supports tombstone transitions.

## Import

```ts
import {
  FilesystemArtifactStore,
  createFilesystemArtifactPlugin
} from "@guga-agent/plugin-artifact-filesystem";
```

## Main APIs

- `createFilesystemArtifactPlugin(options)`: registers a filesystem artifact store with the core plugin context.
- `FilesystemArtifactStore`: direct store implementation for hosts that want to manage registration themselves.
- Types: `FilesystemArtifactPluginOptions`, `FilesystemArtifactStoreOptions`, `ArtifactManifest`, and `ArtifactManifestTransitionRecord`.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [
    createFilesystemArtifactPlugin({
      rootDir: ".guga/artifacts"
    })
  ]
});
```

Advanced hosts can instantiate `new FilesystemArtifactStore({ rootDir })` and register it through a custom plugin.

## Notes

- Artifact content and manifests are stored separately; reads verify the recorded SHA-256 hash.
- Missing, tombstoned, and hash-mismatched artifacts return structured diagnostics.
- The public API currently exposes tombstone behavior, not a separate public redaction helper.
- The package does not automatically persist raw provider payloads; hosts must decide which artifacts to write.

## Related Packages

- `@guga-agent/core` defines `ArtifactStore` contracts.
- `@guga-agent/plugin-replay-audit` can read artifact references during replay.
- `@guga-agent/plugin-session-jsonl` stores durable event references that may point at artifacts.
