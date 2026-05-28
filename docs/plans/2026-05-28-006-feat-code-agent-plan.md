# M9 Code Agent Plan

## Goal

Ship a first-party code-agent profile that composes existing Guga runtime/plugins into a reusable coding workflow bundle and exposes it through CLI.

## Scope

- New package: `@guga-agent/profile-code-agent`.
- CLI `--profile code` selection.
- Hermetic tests for profile metadata, permission defaults, context helpers, test discovery, and CLI integration.
- Docs/solution/blog at finish.

## Non-Goals

- No LSP integration.
- No worktree isolation.
- No subagent execution.
- No project config loader.
- No new core loop semantics.

## Implementation Units

### U1 — Profile Package Skeleton And Metadata

Files:

- `packages/profile-code-agent/package.json`
- `packages/profile-code-agent/src/index.ts`
- `packages/profile-code-agent/src/profile.ts`
- `packages/profile-code-agent/src/profile-code-agent.test.ts`

Work:

- Define `CodeAgentProfile` metadata.
- Export `createCodeAgentProfile()`.
- Export code-agent system prompt as structured helper, not global runtime mutation.

Acceptance:

- Package builds independently.
- Tests assert profile id/name/default goals.

### U2 — Permission Defaults

Files:

- `packages/profile-code-agent/src/permissions.ts`
- `packages/profile-code-agent/src/profile-code-agent.test.ts`

Work:

- Define default permission policy/profile helper.
- Deny destructive shell commands by pattern helper.
- Document read/write/execute defaults.

Acceptance:

- Tests cover read allow, write ask, shell ask, destructive shell deny.

### U3 — Plugin Bundle Factory

Files:

- `packages/profile-code-agent/src/bundle.ts`
- `packages/profile-code-agent/src/profile-code-agent.test.ts`

Work:

- Compose existing first-party plugin factories where available.
- Keep host/CLI out of profile package.
- Return `AgentRuntimeOptions` fragments for consumers.

Acceptance:

- Tests prove bundle registers expected operation/tool capability descriptors through runtime.

### U4 — Repo Context And Test Discovery

Files:

- `packages/profile-code-agent/src/repo-context.ts`
- `packages/profile-code-agent/src/test-discovery.ts`
- `packages/profile-code-agent/src/profile-code-agent.test.ts`

Work:

- Build repo context from explicit inputs: cwd, git status summary, active files, package scripts.
- Infer test commands from changed files and script names.

Acceptance:

- No filesystem reads are required for unit tests.
- Node workspace examples produce deterministic command candidates with reasons.

### U5 — CLI Profile Selection

Files:

- `packages/cli/src/commands/run.ts`
- `packages/cli/src/run.test.ts`
- `packages/cli/package.json`
- `pnpm-lock.yaml`

Work:

- Parse `--profile code`.
- Use code-agent runtime options when selected.
- Preserve `--mock`, provider env config, `--ops`, and debug event behavior.

Acceptance:

- `guga run hello --mock --profile code` succeeds.
- Unknown profile returns a CLI usage error.

### U6 — Docs, Review, Blog, Finish

Files:

- `docs/research/code-agent-architecture.md`
- `docs/solutions/architecture-patterns/code-agent-profile.md`
- `blog/build-agent-from-zero-m9-code-agent.md`

Work:

- Document profile-first decision.
- Run code review.
- Write M9 blog article.
- Archive Trellis task.

Acceptance:

- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`

## Risks

- Existing tool plugin factories may need small option surfaces to compose cleanly.
- Permission policy may need richer shell command matching than the first helper.
- CLI profile selection can grow into config loading; keep this slice explicit.

## Sequencing

1. U1 profile package.
2. U2 permissions.
3. U3 bundle.
4. U4 repo context/test discovery.
5. U5 CLI exposure.
6. U6 docs/blog/finish.
