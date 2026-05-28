# Code Agent Profile

M9 adds Guga's first professional coding agent surface as a profile package, not as a new runtime.

## Problem

Guga already has the ingredients for coding work:

- filesystem, shell, and git tools;
- skills and MCP capability discovery;
- permission runtime;
- host protocol and CLI;
- operations/audit/eval resources.

The risk is putting coding-specific behavior into core just because coding is the first serious product workflow. That would make every future agent role pay for code-agent assumptions.

## Decision

Create `@guga-agent/profile-code-agent`.

The package exports:

- `createCodeAgentProfile()`
- `createCodeAgentSystemPrompt()`
- `createCodeAgentPermissionPolicy()`
- `createCodeAgentPlugins()`
- `createCodeAgentRuntimeOptions()`
- repo context and test discovery helpers

CLI selects it explicitly with `guga run --profile code`.

## Why This Shape

- **Core remains role-neutral.** No code-agent imports or branches were added to `packages/core`.
- **Profile is composition.** The bundle reuses first-party filesystem, shell, git, ops, audit, and eval plugins.
- **Permissions stay runtime-owned.** The profile configures defaults and blocks destructive shell commands, but write/execute approval still belongs to the permission resolver.
- **Context is explicit.** Repo context helpers only summarize caller-provided facts; they do not read files or execute commands as hidden side effects.
- **Test discovery is explainable.** Candidate commands include reasons and confidence levels.

## Current Limits

- No project config loader yet.
- No LSP or symbol index.
- No worktree isolation.
- No subagent delegation.
- Shell danger matching is deliberately conservative and should become policy-driven later.

## Verification

Focused gates added in this slice:

- Profile metadata and prompt tests.
- Permission policy and destructive shell detection tests.
- Bundle capability registration tests.
- Repo context and test discovery tests.
- CLI `--profile code` and unknown profile tests.
