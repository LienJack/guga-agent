# Logging Guidelines

> How logging is done in this project.

---

## Overview

The runtime's primary observability surface is structured events, not console logging. Behavior that matters for replay, audit, UI projection, tests, or debugging should become an `AgentEvent` or store record. Console output belongs in host applications and scripts, not in core runtime paths.

---

## Log Levels

There is no project-wide logging library or log-level taxonomy yet.

Use structured runtime events instead:

- lifecycle facts: session/run start, shutdown, plugin init/shutdown;
- model facts: request/response, usage, provider failure;
- tool facts: call, permission, execution result, failure;
- hook facts: decision, failure, timeout;
- projection facts: context pressure, compaction, audit/replay output.

---

## Structured Logging

Runtime-observable records should include:

- stable type/discriminator;
- `runId` or `sessionId` when applicable;
- timestamp or deterministic order where the store supplies it;
- source/owner metadata for plugin-contributed facts;
- structured error code and message for failures.

Examples:

- `packages/core/src/events/event-bus.ts`
- `packages/core/src/contracts/events.ts`
- `packages/plugin-replay-audit/src/replay-audit-plugin.ts`

---

## What to Log

Record facts that future hosts or agents need to explain behavior:

- provider selection and normalized failure;
- tool call lifecycle and permission outcome;
- hook decisions and failures;
- plugin capability registration and cleanup;
- context projection pressure and compaction boundaries;
- durable artifact/session/memory store operations when they affect replay or audit.

---

## What NOT to Log

- Do not log API keys, credentials, bearer tokens, environment secrets, or full provider request headers.
- Do not dump arbitrary file contents or tool outputs to console from core.
- Do not record private host data unless a contract explicitly owns it and tests cover redaction/truncation behavior.
- Do not rely on free-form log strings for UI state; UI must consume typed events or projections.
