# State Management

> How state is managed in this project.

---

## Overview

No frontend state library is selected. Future UI state should be a projection of runtime/server facts, not a second source of truth for agent execution.

---

## State Categories

- Runtime facts: sessions, runs, events, tool calls, permissions, artifacts. Source of truth is host/runtime.
- Derived UI state: filters, selected session/run, expanded timeline rows, active artifact tab.
- Local form state: prompt composer, search inputs, temporary command parameters.
- URL state: selected session/run/artifact when useful for sharing or reload.

---

## When to Use Global State

Use global/client state only for UI coordination across components. Do not promote runtime facts to global state unless they are synchronized from host events or host SDK queries.

---

## Server State

Server/runtime state should come through the host SDK and event stream. Caches must handle:

- run completion and failure;
- permission resolution;
- artifact creation/update;
- session resume/fork;
- event stream reconnect or replay.

---

## Common Mistakes

- Do not treat chat messages as the only state.
- Do not make permission state local to a modal without updating the runtime.
- Do not let stale event streams update a newly selected session.
- Do not overwrite durable run history with summarized UI text.
