# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Runtime work is TypeScript-first and test-first around behavior-bearing units. The core package must pass typecheck, unit tests, and build before shipping.

---

## Forbidden Patterns

- Do not import real provider SDK types into `packages/core/src/loop`, `state`, `registry`, `runtime`, or `contracts`.
- Do not add real tools such as filesystem, shell, browser, git, or MCP to `packages/core`.
- Do not let provider exceptions or tool exceptions escape without structured runtime handling.
- Do not expose internal helpers from `packages/core/src/index.ts` unless they are part of the intended host-facing API.
- Do not commit generated `packages/*/dist/` output.

---

## Required Patterns

- Use TypeScript `strict` mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Keep public runtime contracts under `packages/core/src/contracts`.
- Add behavior tests for every feature-bearing runtime unit.
- Prefer in-memory fixtures for M0 tests: mock provider and test tool, not external services.
- Keep plan/task artifacts out of runtime imports; code must not depend on `.trellis/` or `docs/`.
- Keep plugin and hook contracts minimal: local trusted plugin object, restricted plugin context, provider/tool/hook registration, and init/shutdown lifecycle only.
- Hook control-flow decisions belong in `HookKernel` and the agent loop control path; do not implement blocking behavior as an `EventBus` listener.

---

## Testing Requirements

For core runtime changes, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Required coverage points for the M0 core loop:

- Successful tool-calling run.
- Tool failure returned as model-visible observation.
- Tool exception normalized to structured tool failure.
- Missing provider/tool returns explicit run failure.
- Provider exception normalized to structured provider failure.
- Max-turns stop path.
- Run result event list contains only the current run's events.
- Local plugin provider/tool/hook registration through `createAgentRuntime({ plugins })`.
- Plugin init failure and partial cleanup.
- Pre-tool gate allow, deny, and thrown-failure paths.
- Async runtime dispose, shutdown failures, and disposed-runtime behavior.

---

## Code Review Checklist

- Does the change keep M0 scope narrow and exclude plugin/provider/tool/persistence/UI work?
- Do public exports match the intended host-facing surface?
- Are failure paths represented in both returned results and emitted events?
- Do tests avoid real provider SDKs and external services?
- Are generated files ignored rather than committed?
