---
title: Plugin Capability Discovery For Skills And MCP
date: 2026-05-27
category: docs/solutions/architecture-patterns
module: agent runtime capability ecosystem
problem_type: architecture_pattern
component: assistant
severity: medium
applies_when:
  - Adding plugin-contributed tools, skills, stores, hooks, or MCP capabilities.
  - Building host surfaces that need to explain what the runtime can do.
  - Implementing plugin reload, cleanup, or capability diff behavior.
tags: [agent-runtime, plugins, skills, mcp, capability-discovery]
---

# Plugin Capability Discovery For Skills And MCP

## Context

M6 moved Guga from "plugins can register capabilities" to "the runtime can explain its capability surface." Before this, `CapabilityRegistry` held providers, tools, models, stores, and replay capabilities, while `PluginHost` tracked plugin contributions internally for cleanup. That was enough to run, but not enough for future CLI, desktop/Web, code-agent, and deep-research surfaces that need to answer:

- Which capabilities are available?
- Which plugin contributed them?
- Did they come from host code, a first-party plugin, or an MCP server?
- What changed after plugin shutdown or reload?
- Why was a conflicting capability skipped or rejected?

The same milestone added concrete first-party skills and MCP plugins. That made the boundary sharper: core should own contracts and authority, but it should not scan skill directories or run MCP child processes.

## Guidance

Use a small, serializable descriptor layer in core and keep concrete capability implementations in plugins.

The core contract is the stable explanation surface:

```typescript
type CapabilityDescriptor = {
  type: PluginCapabilityKind;
  name: string;
  source: "host" | "plugin" | "mcp" | "built-in";
  status: "registered" | "skipped-conflict";
  namespace?: string;
  ownerPluginId?: string;
  reason?: string;
};
```

Core records descriptor metadata when capabilities are registered. `PluginHost` supplies `ownerPluginId` and source metadata when a plugin contributes providers, models, tools, skills, context policies, stores, or replay capabilities. The descriptor list is intentionally data-only: no handlers, no child processes, no `AbortSignal`, no runtime objects.

Skills follow progressive disclosure:

```text
metadata discovery -> body load on demand -> assets resolved at execution time
```

`@guga-agent/plugin-skills` discovers `SKILL.md` metadata from host-configured roots, but it does not load the full body during discovery. Body loading is explicit through `loadSkillBody()`, and asset paths are resolved with a containment guard.

MCP follows the existing tool authority path:

```text
stdio MCP server -> tools/list -> ToolDefinition wrapper -> ExecutionPipeline
```

`@guga-agent/plugin-mcp` supports the M6 stdio MVP and registers MCP tools as ordinary Guga tools named `mcp__server__tool`. Tool execution still goes through the same permission, hook, result, event, and audit path as local tools.

## Why This Matters

Capability discovery is not just an inventory API. It is the bridge between a plugin runtime and product surfaces:

- CLI can show available tools and skills without parsing logs.
- Desktop/Web can explain capability changes after reload.
- Code-agent can reason about a repo's toolset and skills without hardcoding package names.
- Replay/audit can explain the source of a tool or skill.
- Plugin cleanup can prove old capabilities are no longer visible or callable.

The key design choice is that discovery describes capabilities without owning them. Core stays small, but hosts get a stable explanation surface.

## When to Apply

- Add a new first-party plugin package.
- Add a new capability kind to `PluginContext`.
- Add a host command or UI surface that lists runtime capabilities.
- Add MCP, skills, commands, renderers, evals, or stores.
- Implement plugin shutdown, reload, enable, disable, or conflict diagnostics.

## Examples

Wrong: register an MCP tool without source metadata.

```typescript
context.registerTool(mcpTool);
```

This makes the tool callable, but it hides where the tool came from and prevents clear diff/audit output.

Correct: preserve source and namespace while keeping execution in the normal tool pipeline.

```typescript
context.registerTool(mcpTool, {
  source: "mcp",
  namespace: server.name
});
```

Wrong: load every skill body into default model context because discovery found a `SKILL.md`.

Correct: register only metadata first, then load the body only when the host/context policy chooses that skill.

```typescript
const result = await discoverSkills([{ path: ".guga/skills", namespace: "project" }]);
for (const skill of result.skills) {
  context.registerSkill?.(skill.metadata);
}
```

## Related

- `docs/research/skills-mcp-capability-discovery.md`
- `docs/plans/2026-05-27-003-feat-skills-mcp-capability-discovery-plan.md`
- `packages/core/src/contracts/plugins.ts`
- `packages/plugin-skills/src/skill-loader.ts`
- `packages/plugin-mcp/src/mcp-plugin.ts`
