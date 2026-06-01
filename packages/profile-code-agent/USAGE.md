# @guga-agent/profile-code-agent Usage

## Purpose

`@guga-agent/profile-code-agent` provides first-party coding-agent profile helpers, permission policies, runtime bundle composition, repository context discovery, test command discovery, and autonomous code-task contracts.

It composes existing runtime capabilities. It does not own a second agent loop and does not bypass core permission or tool execution paths.

## Import

```ts
import {
  CODE_AGENT_PROFILE_ID,
  CodeTaskController,
  createCodeAgentPlugins,
  createCodeAgentProfile,
  createCodeAgentRuntimeOptions
} from "@guga-agent/profile-code-agent";
```

## Main APIs

- Profile: `createCodeAgentProfile()`, `createCodeAgentSystemPrompt()`, and `CODE_AGENT_PROFILE_ID`.
- Permissions: `createCodeAgentPermissionPolicy()`, `createCodeAgentPermissionResolver()`, and `isDestructiveShellCommand()`.
- Bundle helpers: `createCodeAgentPlugins()` and `createCodeAgentRuntimeOptions()`.
- Repository/test context: `buildRepoContext()`, `renderRepoContext()`, and `discoverTestCommands()`.
- Task controller and contracts: `CodeTaskController`, `createCodeTask()`, `classifyCodeTask()`, `transitionCodeTask()`, `validateCodeTask()`, `buildCodeTaskStagePrompt()`, `runVerification()`, `selectVerificationCommands()`, `summarizeVerificationToolResult()`, `renderCodeTaskContext()`, `createCodeTaskHostRuntime()`, and `createCodeTaskReinjectionSource()`.
- Types for profiles, bundles, permissions, repository context, test discovery, code tasks, stage runs, planned checks, verification attempts, and task lifecycle.

## Common Usage

```ts
const runtimeOptions = createCodeAgentRuntimeOptions({
  workspaceRoot: process.cwd(),
  skills: { roots: [{ path: ".guga/skills", namespace: "project" }] },
  includeOperations: true
});

const runtime = createAgentRuntime(runtimeOptions);
```

For task orchestration, use `CodeTaskController` with stage runners supplied by the host runtime.

## Notes

- The package root exports the public profile and task APIs from `src/index.ts`; not every internal helper in submodules is public.
- Verification runs through runtime/tool paths so permissions, hooks, result budgeting, and durable events still apply.
- Long-running task completion requires verified or done ledger items and passing required verification evidence.

## Related Packages

- `@guga-agent/core` provides runtime, built-ins, permissions, and tool execution.
- `@guga-agent/plugin-skills`, `@guga-agent/plugin-mcp`, `@guga-agent/plugin-ops-health`, `@guga-agent/plugin-audit-export`, and `@guga-agent/plugin-eval-runner` can be composed into the profile.
