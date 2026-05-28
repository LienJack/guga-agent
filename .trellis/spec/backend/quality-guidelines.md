# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Runtime work is TypeScript-first and test-first around behavior-bearing units. The core package must pass typecheck, unit tests, and build before shipping.

---

## Forbidden Patterns

- Do not import real provider SDK types into `packages/core/src/loop`, `state`, `registry`, `runtime`, or `contracts`.
- Do not add real tools such as filesystem, shell, browser, git, or MCP to `packages/core`.
- Do not bypass `ExecutionPipeline` for model-produced tool intents.
- Do not execute side-effecting tools before `PermissionKernel` resolves allow/deny.
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

## Scenario: Capability Discovery And Plugin-Owned Capabilities

### 1. Scope / Trigger

- Trigger: adding or changing runtime capability registration, plugin-owned resources, skills, MCP tools, or capability discovery/diff APIs.

### 2. Signatures

- Core capability descriptors are serializable objects with `type`, `name`, `source`, `status`, and optional `ownerPluginId`, `namespace`, and `reason`.
- Plugin contexts may register `SkillMetadata`, but concrete skill body loading and MCP clients must live outside `packages/core`.
- MCP tools must register as normal `ToolDefinition` values and use `runtime.source.kind = "mcp"`.

### 3. Contracts

- `source` must distinguish `host`, `plugin`, `mcp`, and `built-in`.
- `ownerPluginId` is required for plugin-contributed descriptors.
- `namespace` should identify a stable grouping such as a skill namespace or MCP server name.
- Discovery output must not include executable functions, child processes, AbortSignals, or other non-serializable runtime objects.

### 4. Validation & Error Matrix

- Duplicate capability id without an explicit allowed override -> `CAPABILITY_ALREADY_REGISTERED`.
- Plugin shutdown/dispose -> remove plugin-owned descriptors and callable capabilities.
- MCP/local name collision -> fail closed or report a skipped conflict; do not silently overwrite.
- Skill with missing `name` or `description` -> invalid skill metadata; do not register it.

### 5. Good/Base/Bad Cases

- Good: a plugin registers a skill, discovery shows `type: "skill"`, `source: "plugin"`, and its `ownerPluginId`.
- Base: a host registers a test tool directly, discovery shows `source: "host"`.
- Bad: an MCP client executes a tool outside `ExecutionPipeline` or registers a tool without owner/source metadata.

### 6. Tests Required

- Unit tests for descriptor serialization and capability diff.
- Plugin-host integration tests for register and cleanup.
- Plugin package tests proving skill metadata discovery does not load bodies by default.
- MCP stdio integration tests proving MCP tools are normal Guga tools and are removed on shutdown.

### 7. Wrong vs Correct

#### Wrong

```typescript
context.registerTool(mcpTool);
```

This hides that the tool came from MCP and makes discovery/audit ambiguous.

#### Correct

```typescript
context.registerTool(mcpTool, {
  source: "mcp",
  namespace: serverName
});
```

This keeps the runtime authority path unchanged while preserving explainable source and ownership metadata.

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
- Missing provider returns an explicit run failure; missing model tool intents become structured model-visible tool observations so tool_call/tool_result pairing is preserved.
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
