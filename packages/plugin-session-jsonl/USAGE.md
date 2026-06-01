# @guga-agent/plugin-session-jsonl Usage

## Purpose

`@guga-agent/plugin-session-jsonl` provides local-first JSONL implementations of core `EventStore` and `SessionStore`. It persists durable event envelopes and session tree facts under a host-provided root directory.

## Import

```ts
import {
  JsonlEventStore,
  JsonlSessionStore,
  createJsonlSessionPlugin
} from "@guga-agent/plugin-session-jsonl";
```

## Main APIs

- `createJsonlSessionPlugin(options)`: registers both JSONL event and session stores.
- `JsonlEventStore`: append-only durable event stream store.
- `JsonlSessionStore`: session, branch, and active-leaf fact store.
- Types: `JsonlSessionPluginOptions`, `JsonlEventStoreOptions`, and `JsonlSessionStoreOptions`.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [
    createJsonlSessionPlugin({
      rootDir: ".guga/sessions"
    })
  ]
});
```

Advanced hosts can instantiate stores directly:

```ts
const eventStore = new JsonlEventStore({ rootDir: ".guga/sessions/events" });
const sessionStore = new JsonlSessionStore({ rootDir: ".guga/sessions/sessions" });
```

## Notes

- Event records are append-only durable envelopes with expected revision and idempotency support.
- Reads validate revision order and hash-chain continuity.
- A partial final line can be reported as a recoverable tail diagnostic on reads, but appends refuse to continue writing into a stream with a partial tail.
- The in-process append queue is not a cross-process lock.
- This package does not implement remote sync, search, multi-writer conflict resolution, or curated memory.

## Related Packages

- `@guga-agent/core` defines persistence contracts.
- `@guga-agent/plugin-replay-audit` reads these stores for replay.
