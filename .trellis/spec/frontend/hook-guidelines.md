# Hook Guidelines

> How hooks are used in this project.

---

## Overview

No React hooks exist yet. Future UI hooks should wrap host SDK subscriptions, actions, and derived projections. They should stay outside core/runtime packages.

---

## Custom Hook Patterns

- Use hooks to subscribe to host event streams and derive view state.
- Keep protocol decoding in one adapter layer.
- Return explicit state objects such as `{ status, data, error }`.
- Keep side-effecting actions named and typed.

---

## Data Fetching

No data-fetching library is chosen. Future UI should use the host SDK for:

- session list/read;
- run start/cancel/resume/fork;
- permission response;
- artifact read/list;
- event stream subscription.

---

## Naming Conventions

- Use `use*` names only inside React UI packages.
- Prefer domain names such as `useRunTimeline`, `usePermissionQueue`, `useArtifactList`, and `useSessionEvents`.
- Avoid names that hide side effects, such as `useAgentMagic`.

---

## Common Mistakes

- Do not open multiple event streams for the same session without ownership.
- Do not retry side-effecting commands blindly.
- Do not store secrets or raw provider payloads in browser state.
- Do not let hooks mutate core runtime state directly.
