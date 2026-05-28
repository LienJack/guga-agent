# Directory Structure

> How backend code is organized in this project.

---

## Overview

Guga Agent backend/runtime code is a TypeScript workspace with a small core kernel plus explicit built-in capability modules and optional extension/plugin packages. Keep the core kernel small: it owns contracts, in-memory runtime primitives, execution pipeline, permission kernel, scheduler, result policy, and test fixtures. Default filesystem, shell, git, and AI SDK bridge implementations may live only under `packages/core/src/builtins/*`; do not add CLI, Web, persistence, UI projection, or optional ecosystem integrations to core kernel layers.

---

## Directory Layout

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
packages/
  core/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      index.ts
      contracts/
      events/
      hooks/
      loop/
      plugin-host/
      registry/
      runtime/
      state/
      tools/
      testing/
      builtins/
        filesystem.ts
        git.ts
        shell.ts
        provider-ai-sdk.ts
  extension-sdk/
  provider-ai-sdk/
  plugin-tools-filesystem/
  plugin-tools-shell/
  plugin-tools-git/
```

---

## Module Organization

- `contracts/`: stable public runtime types such as messages, provider responses, tool results, events, errors, and runtime options.
- `registry/`: in-memory capability registration and resolution.
- `events/`: in-memory event publishing and recording.
- `hooks/`: in-memory hook kernel for control-flow decisions such as pre-tool gate and lifecycle observe hooks.
- `state/`: conversation state and model/tool message ordering.
- `loop/`: the minimal agent loop state machine.
- `plugin-host/`: local trusted plugin initialization, restricted plugin context, capability registration, and runtime-scoped cleanup.
- `runtime/`: host-facing runtime facade and factory.
- `tools/`: core-owned control-plane utilities such as execution pipeline, scheduler, resource scopes, and result policy. Real tool implementations do not belong here.
- `testing/`: mock provider and test tool fixtures for core tests only; these are not default runtime capabilities.
- `builtins/`: default coding-agent substrate implementations for filesystem, git, shell, and AI SDK bridge. These modules may use real local backends or optional provider SDK adapters, but kernel sublayers must not import them.

Do not put real provider SDKs or real tools in `packages/core/src/contracts`, `registry`, `hooks`, `permissions`, `tools`, `loop`, or other kernel sublayers. Optional ecosystem integrations such as MCP, skills, memory, artifact, replay/audit, eval, and delegation belong outside core as extensions or compatibility packages.

---

## Naming Conventions

- Use kebab-case file names for TypeScript modules, e.g. `agent-loop.ts`, `event-bus.ts`.
- Use `*.test.ts` beside the implementation file's module directory.
- Export the public API through `packages/core/src/index.ts`; avoid making implementation helpers public unless a host or later package needs them.

---

## Examples

- `packages/core/src/loop/agent-loop.ts`: minimal non-streaming tool-calling loop.
- `packages/core/src/runtime/create-agent-runtime.ts`: host-facing factory.
- `packages/core/src/hooks/hook-kernel.ts`: deterministic hook execution and pre-tool gate reduction.
- `packages/core/src/plugin-host/plugin-host.ts`: local plugin lifecycle and capability registration boundary.
- `packages/core/src/testing/mock-provider.ts`: test-only provider fixture.
