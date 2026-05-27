# Code Agent Architecture Research

## 一句话结论

M9 应采用 **profile/bundle-first code agent**：Guga 的 code-agent 是一个 first-party profile package，组合 tools、permissions、repo context、test discovery 和 host CLI；core 不新增 coding 专用流程。

## 项目对比

| 项目 | 证据 | Guga 判断 |
| --- | --- | --- |
| OpenCode | Fact: `docs/research/source-analysis/learn-opencode/docs/packages/opencode/01-agents-and-permissions.md` 定义 `build`、`plan`、`explore`、`general` 等 agent，权限由 defaults/agent/user 三层合并。 | Adopt profile-level agent definitions and permission defaults. |
| OpenCode custom agents | Fact: `docs/research/source-analysis/learn-opencode/docs/cookbook/01-create-custom-agent.md` 展示通过 JSON/Markdown 定义 agent prompt、model、permission。 | Adapt as typed package exports first; project config loading can come later. |
| Claude Code | Fact: `docs/research/source-analysis/claude-code-analysis/analysis/04h-multi-agent.md` 描述 subagent/coordinator/swarm 三层体系。 | Skip swarm for M9; adopt the idea that coding workflows can be specialized roles without core branching. |
| Hermes | Fact: `docs/research/source-analysis/hermes-wiki/concepts/worktree-isolation.md` documents per-agent git worktree isolation for parallel coding work. | Defer worktree isolation to a later multi-agent/worktree module; keep M9 single-worktree. |
| Context packs | Fact: `docs/research/context-packs/tool-registry.md` and `ui-protocol.md` recommend unified tool pool, allow/ask/deny permissions, and host/SDK/CLI as product surface. | Reuse existing Guga plugins and host protocol; code-agent should not own transport. |
| Guga M6-M8 | Fact: Guga already has plugin tools, skills/MCP, host protocol/CLI, operation resources, and permission contracts. | M9 should assemble these into a code profile instead of inventing new primitives. |

## 可借鉴模式

- **Profile-level permissions**: OpenCode's default/agent/user layering maps to Guga's `PermissionPolicy` plus future user overrides.
- **Specialized agent roles**: build/explore/plan are useful as future profiles, but M9 should ship only one `code` profile.
- **CLI as dogfood path**: host protocol remains the runtime surface; `guga run --profile code` should exercise the same host SDK.
- **Hermetic test discovery**: code-agent must be able to propose validation commands without running arbitrary shell during context assembly.
- **Progressive capability assembly**: use plugins as bundle members, not static imports inside core.

## 不建议照搬

- 不照搬 Claude Code swarm/team/mailbox；M9 scope is single-agent profile.
- 不照搬 OpenCode config loader yet; typed exports are enough for first-party use.
- 不照搬 Hermes worktree setup yet; branch/worktree automation deserves its own safety design.
- 不让 profile directly mutate files; file writes remain tool calls under permission.

## Guga 落点

1. Create `packages/profile-code-agent`.
2. Export a `createCodeAgentRuntimeOptions()` helper that returns plugins and permission policy.
3. Export `createCodeAgentProfile()` metadata for host/CLI selection.
4. Add repo context helpers that summarize workspace facts from provided inputs.
5. Add test discovery helpers that inspect package scripts and changed file paths.
6. Teach CLI `--profile code` to use this bundle.

## 证据

- Fact: `docs/research/context-packs/agent-loop.md` recommends iteration budgets, safe tool execution, and event-based loop facts.
- Fact: `docs/research/context-packs/tool-registry.md` identifies allow/ask/deny, unified tool pools, and progressive skills as cross-project consensus.
- Fact: `docs/research/context-packs/context-compression.md` recommends preserving active files, plan state, and tool pairing across compaction/resume.
- Fact: `docs/research/context-packs/ui-protocol.md` recommends server/host surfaces as the shared product boundary.
- Fact: `docs/research/context-packs/multi-agent.md` recommends single-layer delegation first and defers swarm.
- Inference: Because Guga already shipped M6-M8 substrates, the smallest high-value M9 is composition rather than new core control flow.
