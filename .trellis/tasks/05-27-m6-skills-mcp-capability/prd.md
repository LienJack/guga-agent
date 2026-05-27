# brainstorm: M6 skills MCP capability discovery

## Goal

Execute the next roadmap module for Guga Agent by turning M6 Skills / MCP / Capability Discovery into a concrete research, planning, and implementation track. The immediate goal is not to ship the whole module in one blind pass; it is to establish the PRD, context, research target, and acceptance criteria so implementation can proceed through the required `ce-brainstorm` -> `trellis-brainstorm` -> research -> `ce-plan` -> `ce-work` gates.

## What I already know

- `任务.md` identifies M6 as the next major module after current core/plugin runtime baseline confirmation.
- `docs/roadmap.md` says the next engineering focus is capability ecosystem: skills, MCP, capability discovery, plugin install/enable/disable/reload, and explainable capability surfaces.
- `packages/core/README.md` confirms core already owns runtime contracts, plugin mounting, capability registry, hook kernel, permission/tool pipeline, durable stores contracts, and replay boundaries.
- Core explicitly does not implement skills, MCP, plugin manifests, directory scanning, namespaces, reload, marketplace, or stale context guard.
- `docs/research/context-packs/tool-registry.md` already provides a first evidence base for tools, permissions, MCP, skills, and plugin capability boundaries.
- Project rules require the 7-layer research funnel before raw source reads for reference-agent analysis.

## Assumptions

- M6 starts before Host Protocol, Code Agent, and Deep Research Agent because those later modules need explainable capability discovery and plugin-owned skills/tools.
- M6 should first support stdio MCP only unless research shows a stronger MVP reason for SSE/WebSocket/HTTP.
- Skills should follow progressive disclosure: metadata is discoverable by default, body loads on demand, assets load only when a selected skill needs them.
- Concrete package names can be finalized in the plan, but expected first-party plugin packages are `plugin-skills` and `plugin-mcp`.

## Resolved Questions

- M6 stops at the typed runtime/plugin API plus tests. Host/CLI discovery surfaces move to M7/M11.
- M6 implements owner-scoped cleanup through plugin host shutdown/init-failure cleanup and capability diff snapshots. Full hot reload stays out of scope.

## Requirements

- R1. Produce `docs/research/skills-mcp-capability-discovery.md` before implementation.
- R2. Produce a `docs/plans/*m6*` plan before code changes.
- R3. Define and implement skill metadata/body/assets progressive loading.
- R4. Define and implement MCP stdio server registration and tool normalization.
- R5. Ensure MCP tool calls use the same permission, hook, result policy, event, and audit pipeline as local tools.
- R6. Expose capability discovery by type, namespace, owner plugin, source, and runtime status.
- R7. Expose capability diff for plugin enable/disable/reload.
- R8. Make namespace conflict policy explicit and covered by tests.
- R9. Ensure plugin reload cannot leave stale visible or callable capabilities.
- R10. Keep concrete skills/MCP behavior outside `packages/core` except for stable contracts that the runtime must own.

## Acceptance Criteria

- [x] Requirements doc exists at `docs/brainstorms/2026-05-27-m6-skills-mcp-capability-discovery-requirements.md`.
- [x] Research report exists at `docs/research/skills-mcp-capability-discovery.md`.
- [x] Plan exists under `docs/plans/`.
- [x] Implementation adds or updates focused tests for skills progressive loading.
- [x] Implementation adds or updates focused tests for MCP stdio integration.
- [x] Implementation adds or updates focused tests for namespace conflicts.
- [x] Implementation adds or updates focused tests for plugin reload cleanup.
- [x] Relevant `pnpm test`, `pnpm typecheck`, and `pnpm build` checks pass or failures are documented with exact blockers.
- [x] `ce-code-review` has been run for M6-related changes.
- [x] `ce-compound` solution note exists at `docs/solutions/architecture-patterns/plugin-capability-discovery.md`.
- [x] M6 blog exists at `blog/build-agent-from-zero-m6-skills-mcp.md`.
- [ ] `trellis-finish-work` is still pending a clean commit boundary; the working tree contains pre-existing unrelated document moves/deletions outside the M6 task.

## Definition of Done

- M6 requirements, research, plan, implementation, tests, review, solution note, blog, and Trellis archive are complete.
- Capability discovery is good enough for later CLI/desktop/Web/code-agent surfaces to consume without parsing logs or assistant prose.
- Core remains small and does not import concrete MCP, skills, filesystem scanning, or host UI implementation.

## Out of Scope

- Full marketplace.
- Signed third-party plugin distribution.
- Multi-transport MCP beyond stdio in M6.
- Desktop/Web discovery UI.
- Code-agent or deep-research-agent implementation.

## Technical Notes

- Follow `AGENTS.md` 7-layer research funnel.
- Start from `docs/research/context-packs/tool-registry.md`.
- Use `docs/research/source-analysis/design-ideas-index.md` to route deeper Tools/MCP/Skills research.
- Keep documents using repo-relative paths.
- Do not read raw reference source unless context packs, graph/source-analysis, and repomix materials are insufficient.
