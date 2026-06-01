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

## Parameters

- `createCodeAgentRuntimeOptions(options)` and `createCodeAgentPlugins(options)` require `workspaceRoot`. Optional `skills.roots` registers project or user skill roots, `mcp.servers` registers MCP servers, and `includeOperations` controls whether ops-health, audit-export, and eval-runner plugins are included; it defaults to `true`.
- `createCodeAgentProfile(options)` accepts optional `workspaceRoot` metadata for the profile. `createCodeAgentPermissionPolicy(options)` accepts optional `delegate` and `timeoutMs`; `createCodeAgentPermissionResolver(delegate)` accepts an optional host resolver for decisions the profile does not handle directly.
- `buildRepoContext(options)` requires `workspaceRoot`; `gitStatus`, `activeFiles`, `packageScripts`, and `notes` are optional and are normalized for rendering. `discoverTestCommands(options)` accepts optional `packageManager`, `packageScripts`, and `changedFiles`.
- `CodeTaskController` requires an `invoker` and `runStage` callback. Optional fields include `now`, `maxRepairAttempts`, `onTaskCreated`, `onTransition`, and `onVerificationStarted`.
- `CodeTaskController.start(options)` requires task identity and objective fields (`taskId`, `sessionId`, `rootRunId`, `cwd`, `objective`) plus the user `prompt`. `changedFiles` and `plannedChecks` are optional; when checks are omitted, verification commands are selected from task plans or discovered package scripts.

## Notes

- The package root exports the public profile and task APIs from `src/index.ts`; not every internal helper in submodules is public.
- Verification runs through runtime/tool paths so permissions, hooks, result budgeting, and durable events still apply.
- Long-running task completion requires verified or done ledger items and passing required verification evidence.

## Related Packages

- `@guga-agent/core` provides runtime, built-ins, permissions, and tool execution.
- `@guga-agent/plugin-skills`, `@guga-agent/plugin-mcp`, `@guga-agent/plugin-ops-health`, `@guga-agent/plugin-audit-export`, and `@guga-agent/plugin-eval-runner` can be composed into the profile.
