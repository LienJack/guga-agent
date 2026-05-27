# Directory Structure

> How frontend code is organized in this project.

---

## Overview

There is no React/Web/Desktop frontend app in the repository today. The current user-facing surface is `packages/cli`, and frontend-facing contracts live in host protocol/runtime packages. Future Web or desktop UI must consume the host protocol and runtime event/projection contracts rather than reimplementing the agent loop.

---

## Directory Layout

```
packages/
  cli/                 # command-line host surface
  host-protocol/       # typed protocol/event contracts
  host-runtime/        # runtime-to-host projection/adaptation
  host-local-server/   # local server adapter
  host-sdk/            # typed client
```

---

## Module Organization

- Put protocol contracts in `packages/host-protocol`.
- Put runtime orchestration and host adapter logic in `packages/host-runtime` or a host package.
- Keep UI-specific rendering out of `packages/core`.
- Future Web/Desktop packages should be app packages under `packages/` or `apps/`, consuming `@guga-agent/host-sdk` and typed events.

---

## Naming Conventions

- Use kebab-case file names for TypeScript modules.
- Use `*.test.ts` beside host/protocol implementation files.
- Name event/projection files by protocol concept, not component shape.

---

## Examples

- `packages/cli/src/cli.ts`: CLI surface.
- `packages/host-protocol/src/index.ts`: host-facing protocol exports.
- `packages/host-runtime/src/host-runtime.ts`: runtime host orchestration.
- `packages/host-sdk/src/index.ts`: typed SDK entrypoint.
