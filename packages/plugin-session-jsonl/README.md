# @guga-agent/plugin-session-jsonl

Local-first JSONL session and event stores for Guga runtimes.

The plugin registers an append-only `EventStore` and `SessionStore` through the normal plugin context. It writes newline-delimited durable event records and session tree facts under a host-provided root directory.

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createJsonlSessionPlugin } from "@guga-agent/plugin-session-jsonl";

const runtime = createAgentRuntime({
  plugins: [createJsonlSessionPlugin({ rootDir: ".guga/sessions" })]
});
```

## Behavior

- Event records are append-only and carry durable envelope metadata from `@guga-agent/core`.
- Appends support expected revision checks and idempotency keys.
- Session facts preserve branch lineage and active leaf movement.
- Reads validate stream revision order and hash-chain continuity.
- A partial final line is reported as a recoverable tail diagnostic.
- Middle corruption and hash-chain mismatch are reported as blocking corruption diagnostics.
- Host/profile-sourced facts, such as durable code-task ledger events, are stored as ordinary durable envelopes with their own `eventType` and idempotency key. The JSONL store does not need to understand code-task semantics to preserve and replay them.

This package does not implement remote sync, search, multi-writer conflict resolution, or curated memory.
