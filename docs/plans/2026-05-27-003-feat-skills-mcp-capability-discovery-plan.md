---
title: feat: Add skills, MCP, and capability discovery
type: feat
status: active
date: 2026-05-27
origin: docs/brainstorms/2026-05-27-m6-skills-mcp-capability-discovery-requirements.md
---

# feat: Add skills, MCP, and capability discovery

## Summary

M6 adds the capability ecosystem layer that later CLI, desktop/Web, code-agent, and deep-research-agent surfaces need. Core should gain stable contracts and ownership-aware discovery/diff surfaces, while concrete skills and MCP behavior land in first-party plugins: `packages/plugin-skills` and `packages/plugin-mcp`. Skills use metadata -> body -> assets progressive loading. MCP starts with stdio and exposes server tools as normal runtime tools that still pass through Guga's permission, hook, result policy, event, and audit pipeline.

## Problem Frame

Guga already has a small core runtime, plugin host, capability registry, hook kernel, permission/tool execution pipeline, and durable store/replay contracts. The next gap is explainable runtime capability composition: hosts and future professional agents need to know which providers, tools, skills, hooks, policies, and stores are available, where they came from, what changed after plugin reload, and why conflicts were skipped. Without this layer, M7/M11 host protocol and M9/M10 professional agents would be forced to scrape logs or duplicate plugin bookkeeping.

## Requirements

- R1. Discover `SKILL.md` metadata without loading full bodies into default model context.
- R2. Load full skill bodies only on demand, and resolve assets/references/templates/scripts at execution time.
- R3. Register stdio MCP servers and normalize listed tools into the same `ToolDefinition` surface as local tools.
- R4. Use stable MCP names, defaulting to `mcp__server__tool`.
- R5. Expose capability discovery by type, name/id, namespace, owner plugin, source, and status.
- R6. Expose capability diff for plugin enable/disable/reload.
- R7. Make namespace conflicts explicit and fail closed; never silently overwrite trusted capabilities.
- R8. Ensure plugin reload or shutdown removes stale visible/callable capabilities.
- R9. Keep concrete skills/MCP behavior outside `packages/core` except for public contracts and runtime authority.

## Scope Boundaries

- M6 supports stdio MCP only.
- M6 does not build a marketplace, signature system, remote install flow, or desktop/Web discovery UI.
- M6 does not implement code-agent, deep-research-agent, or CLI product UX beyond possible smoke examples.
- M6 does not load skill bodies into the default system prompt automatically.
- M6 does not add full OAuth, SSE, WebSocket, HTTP MCP transport, or IDE allowlists.

## Context & Research

- `docs/research/skills-mcp-capability-discovery.md` recommends small core contract additions plus first-party plugins.
- `docs/research/context-packs/tool-registry.md` shows reference projects converge on unified tool pools, fail-closed conflicts, and progressive skill loading.
- `packages/core/src/registry/capability-registry.ts` already lists/removes providers, models, tools, context policies, stores, and replay capabilities.
- `packages/core/src/plugin-host/plugin-host.ts` already tracks plugin-owned contributions for cleanup and shutdown.
- `packages/plugin-context-default` and tool plugins provide first-party package layout and dependency-boundary test patterns.

## Key Technical Decisions

| Decision | Rationale |
| --- | --- |
| Core owns discovery contracts; plugins own concrete scanning/clients | Discovery is a runtime contract; filesystem skills and MCP clients are optional capabilities. |
| Capability ownership is first-class | Diff, reload, conflict reporting, and stale cleanup all depend on knowing owner plugin and source. |
| Skills are capabilities, not tools by default | A skill describes reusable instructions and assets; a host or context policy can decide when to load the body. |
| MCP tools wrap into `ToolDefinition` | This preserves the existing execution authority model and avoids bypassing permission/audit/replay. |
| Conflicts produce skipped descriptors | Failing closed is correct, but hosts still need to explain what was skipped and why. |
| Reload is owner-scoped first | Full marketplace lifecycle can come later; M6 needs deterministic removal and re-addition of plugin-owned capabilities. |

## Implementation Units

### U1: Core capability discovery contracts and owner descriptors

**Goal:** Add public types and registry/host APIs that describe capabilities without exposing private runtime objects.

**Files:**

- Modify: `packages/core/src/contracts/plugins.ts`
- Modify: `packages/core/src/contracts/events.ts`
- Modify: `packages/core/src/registry/capability-registry.ts`
- Modify: `packages/core/src/plugin-host/plugin-host.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/registry/capability-registry.test.ts`
- Test: `packages/core/src/plugin-host/plugin-host.test.ts`

**Approach:** Introduce `CapabilityDescriptor`, `CapabilitySource`, `CapabilityDiff`, and skill-specific descriptor contracts. Extend registry/host registration paths to record owner/source metadata for providers, models, tools, hooks, context policies, stores, replay, and skills. Keep callable/runtime objects out of descriptors. Add a discovery method on runtime-facing objects or exported helper that returns stable serializable descriptors.

**Patterns to follow:** Existing `PluginCapabilityRegistered` events and `PluginContribution` cleanup in `packages/core/src/plugin-host/plugin-host.ts`.

**Test scenarios:**

- Register capabilities through a plugin and discovery returns owner plugin id, source, type, and name.
- Duplicate registration produces a conflict descriptor or explicit `CAPABILITY_ALREADY_REGISTERED` failure without silent overwrite.
- Plugin shutdown removes plugin-owned capabilities from discovery.
- Discovery descriptors are serializable and do not include handler functions.

**Verification:** Core unit tests pass for registry and plugin host.

### U2: Plugin reload and capability diff

**Goal:** Provide an MVP reload/diff mechanism that can explain added, removed, and skipped capabilities for one plugin host lifecycle.

**Files:**

- Modify: `packages/core/src/plugin-host/plugin-host.ts`
- Modify: `packages/core/src/runtime/agent-runtime.ts`
- Modify: `packages/core/src/runtime/create-agent-runtime.ts`
- Modify: `packages/core/src/contracts/runtime.ts`
- Test: `packages/core/src/plugin-host/plugin-host.test.ts`
- Test: `packages/core/src/runtime/agent-runtime.test.ts`

**Approach:** Snapshot discovery before and after initialize/shutdown/reload-like lifecycle transitions, then compute diff by descriptor identity. If full runtime reload is too broad, implement owner-scoped cleanup plus reinitialize on dispose/initialize and expose diff as a pure helper for hosts and tests.

**Patterns to follow:** Existing `PluginHost.shutdown()` cleanup and runtime `dispose()` semantics.

**Test scenarios:**

- A plugin capability appears after initialize and disappears after shutdown.
- Reinitializing a runtime with a changed plugin contribution reports added/removed descriptors.
- An old tool from a removed plugin cannot be required or executed after cleanup.

**Verification:** Runtime and plugin host tests pass.

### U3: `plugin-skills` progressive loader

**Goal:** Add a first-party plugin package that discovers skill metadata and loads bodies/assets on demand.

**Files:**

- Create: `packages/plugin-skills/package.json`
- Create: `packages/plugin-skills/tsconfig.json`
- Create: `packages/plugin-skills/vitest.config.ts`
- Create: `packages/plugin-skills/src/index.ts`
- Create: `packages/plugin-skills/src/skills-plugin.ts`
- Create: `packages/plugin-skills/src/skill-loader.ts`
- Create: `packages/plugin-skills/src/skill-frontmatter.ts`
- Test: `packages/plugin-skills/src/skill-loader.test.ts`
- Test: `packages/plugin-skills/src/runtime-integration.test.ts`
- Test: `packages/plugin-skills/src/dependency-boundary.test.ts`

**Approach:** Accept configured skill roots rather than reading global user directories by default. Parse `SKILL.md` frontmatter for `name` and `description`, preserve body location, and expose a loader for explicit body reads. Record assets as path refs under the skill directory; do not read assets during metadata discovery.

**Patterns to follow:** First-party plugin package layout from `packages/plugin-context-default` and dependency-boundary tests from tool plugins.

**Test scenarios:**

- Metadata discovery reads only frontmatter and path metadata.
- Body load returns markdown body only when explicitly requested.
- Missing `name` or `description` is reported as invalid metadata.
- Duplicate skill names produce deterministic conflicts.
- Runtime integration registers skill descriptors through the plugin.

**Verification:** `pnpm --filter @guga-agent/plugin-skills test` and typecheck pass.

### U4: `plugin-mcp` stdio tool integration

**Goal:** Add a first-party MCP plugin that connects to a minimal stdio server and registers MCP tools as Guga tools.

**Files:**

- Create: `packages/plugin-mcp/package.json`
- Create: `packages/plugin-mcp/tsconfig.json`
- Create: `packages/plugin-mcp/vitest.config.ts`
- Create: `packages/plugin-mcp/src/index.ts`
- Create: `packages/plugin-mcp/src/mcp-plugin.ts`
- Create: `packages/plugin-mcp/src/mcp-stdio-client.ts`
- Create: `packages/plugin-mcp/src/mcp-tool-adapter.ts`
- Test: `packages/plugin-mcp/src/mcp-stdio-client.test.ts`
- Test: `packages/plugin-mcp/src/runtime-integration.test.ts`
- Test: `packages/plugin-mcp/src/dependency-boundary.test.ts`

**Approach:** Keep the client small and test-driven. Support JSON-RPC initialize, `tools/list`, and `tools/call` over stdio if using a local minimal protocol implementation; or use an MCP SDK only if planning-time dependency check shows it fits current ESM/Vitest setup. Normalize names as `mcp__${serverName}__${toolName}` and cap descriptions.

**Patterns to follow:** Tool plugin registration shape from `packages/plugin-tools-filesystem` and `packages/plugin-tools-shell`.

**Test scenarios:**

- A fixture stdio MCP server lists one tool and the plugin registers it as a Guga tool.
- Calling the registered Guga tool sends `tools/call` to the MCP server and returns structured output.
- Local tool and MCP name collision is rejected or skipped with an explainable conflict.
- Plugin shutdown closes the child process and removes registered tools.

**Verification:** `pnpm --filter @guga-agent/plugin-mcp test` and typecheck pass.

### U5: Docs, examples, and package workspace wiring

**Goal:** Make M6 discoverable for future agents and users.

**Files:**

- Modify: `docs/roadmap.md`
- Modify: `packages/core/README.md`
- Create/Modify: `packages/plugin-skills/README.md`
- Create/Modify: `packages/plugin-mcp/README.md`
- Modify: `package.json` only if new scripts or dependencies are needed.

**Approach:** Document capability discovery, skills progressive loading, MCP stdio support, conflict rules, and reload/diff boundaries. Keep docs aligned with actual public exports.

**Test scenarios:**

- README examples compile or correspond to exported API names.
- `pnpm -r test`, `pnpm -r typecheck`, and `pnpm -r build` pass.

**Verification:** Full package checks pass or blockers are recorded.

## Dependencies And Sequencing

1. U1 must land before U3/U4 because plugins need skill descriptors and source/owner metadata.
2. U2 can be implemented after U1 or alongside U3/U4 if the descriptor identity is stable.
3. U3 and U4 can be developed independently after U1; both touch workspace package wiring but not the same source files.
4. U5 should happen last so docs reflect the actual public API.

## Risks

- MCP stdio protocol implementation could become larger than expected; if so, prefer a minimal fixture-driven client for M6 and defer full protocol coverage.
- Capability discovery might leak runtime handlers if descriptors are built from raw objects. Tests must assert serializability.
- Plugin reload can be misleading if it does not include hooks/context policies/stores; diff must cover all capability types exposed in discovery.
- Skill parsing can become YAML-complete work. M6 only needs frontmatter fields that Guga consumes.

## Verification

- `pnpm --filter @guga-agent/core test`
- `pnpm --filter @guga-agent/plugin-skills test`
- `pnpm --filter @guga-agent/plugin-mcp test`
- `pnpm -r typecheck`
- `pnpm -r build`

## Deferred To Implementation

- Exact MCP SDK dependency decision.
- Exact reload API name and whether it lives on runtime or plugin host.
- Whether a small CLI/server command is needed as a smoke demo, or runtime API tests are enough for M6.
