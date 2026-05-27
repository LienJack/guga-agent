# M6 Skills, MCP, And Capability Discovery Requirements

## Goal

Build the next capability-ecosystem milestone for Guga Agent: first-party skills, MCP integration, capability discovery, capability diff, namespace conflict handling, and plugin reload boundaries. M6 should keep `packages/core` small while making runtime capabilities explainable to CLI, future desktop/Web hosts, code-agent, and deep-research-agent.

## Context

`docs/roadmap.md` and `任务.md` identify M6 as the next major module after the existing M0-M5 core/runtime/plugin baseline. `packages/core/README.md` confirms that core already owns provider-neutral runtime contracts, plugin mounting, capability registry, hook/permission/tool pipeline, durable store contracts, and replay boundaries. Core explicitly does not own skills, MCP, plugin manifests, directory scanning, remote install, sandboxing, signing, namespaces, reload, or stale context guard.

Existing research in `docs/research/context-packs/tool-registry.md` says reference projects converge on:

- A unified capability/tool pool assembled from built-ins, plugins, and MCP.
- Built-in capability priority when names conflict.
- Skills as progressive disclosure: metadata always visible, body loaded on demand, assets read at execution time.
- MCP tools normalized into the same model-visible tool schema as local tools.
- Permission and audit hooks around tool execution.

## Requirements

- R1. Implement a first-party skills capability that can discover `SKILL.md` files from configured roots and register skill metadata without loading full bodies into the default model context.
- R2. Define a skill loading contract with three levels: metadata, body, and assets.
- R3. Implement an MCP capability boundary that can register configured stdio MCP servers, normalize their tools, and route tool calls through the same core tool execution pipeline.
- R4. Define stable MCP naming and namespace rules, with a default format compatible with the existing research recommendation: `mcp__server__tool`.
- R5. Add capability discovery output that can explain registered providers, models, tools, skills, context policies, stores, hooks, and plugin-owned capabilities.
- R6. Add capability diff output that explains what changed after plugin enable, disable, or reload.
- R7. Make namespace conflict behavior explicit and fail closed: built-in or already-trusted capabilities cannot be silently overwritten by third-party or MCP capabilities.
- R8. Define the plugin enable/disable/reload MVP so old plugin context cannot continue mutating the new runtime capability surface.
- R9. Ensure discovery/diff events are durable or replay-explainable enough for future CLI, desktop/Web, audit, and eval surfaces.
- R10. Keep `packages/core` limited to contracts and runtime authority; concrete skills/MCP implementations belong in first-party plugin packages.

## Acceptance Criteria

- [ ] A research report exists at `docs/research/skills-mcp-capability-discovery.md` with Fact / Inference / Pending Verification evidence.
- [ ] A plan exists under `docs/plans/` before implementation begins.
- [ ] `plugin-skills` can discover metadata without loading full skill bodies by default.
- [ ] `plugin-skills` can load a skill body on demand and resolve asset paths only at execution time.
- [ ] `plugin-mcp` can connect to a minimal stdio MCP server in tests and expose its tools through the runtime capability surface.
- [ ] Capability discovery can list capabilities by type, namespace, owner plugin, and source.
- [ ] Capability diff can explain added, removed, and conflict-skipped capabilities.
- [ ] Namespace conflict tests cover built-in/plugin/MCP collisions.
- [ ] Plugin reload tests prove removed capabilities are no longer visible or callable.
- [ ] M6 verification runs relevant tests, typecheck, and build commands.

## Out Of Scope

- Full marketplace, remote install, signing, and third-party trust distribution.
- Non-stdio MCP transports unless the research/plan proves they are necessary for M6.
- Full desktop/Web UI for discovery; M6 only needs the typed/runtime surface that later hosts can consume.
- Long-term memory, code-agent behavior, deep-research behavior, or CLI product UX beyond what is needed to verify capability surfaces.

## Risks

- Loading skill bodies too early will pollute model context and undermine progressive disclosure.
- Letting MCP tools bypass the existing permission/tool pipeline would split the runtime authority model.
- Plugin reload can leave stale callable handles unless ownership and deregistration are explicit.
- Capability discovery can become a UI-specific dump if the contract does not distinguish source, owner, namespace, and type.

## References

- `任务.md`
- `docs/roadmap.md`
- `packages/core/README.md`
- `docs/research/context-packs/tool-registry.md`
- `docs/research/source-analysis/design-ideas-index.md`
- `.trellis/spec/guides/agent-reference-projects-guide.md`
