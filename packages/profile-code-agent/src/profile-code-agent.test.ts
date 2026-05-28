import { describe, expect, it } from "vitest";
import { createAgentRuntime, type PermissionRequest } from "@guga-agent/core";
import { createCodeAgentPlugins, createCodeAgentRuntimeOptions } from "./bundle";
import { createCodeAgentPermissionPolicy, createCodeAgentPermissionResolver, isDestructiveShellCommand } from "./permissions";
import { CODE_AGENT_PROFILE_ID, createCodeAgentProfile, createCodeAgentSystemPrompt } from "./profile";
import { buildRepoContext, renderRepoContext } from "./repo-context";
import { discoverTestCommands } from "./test-discovery";

describe("profile-code-agent", () => {
  it("defines stable profile metadata", () => {
    const profile = createCodeAgentProfile({ workspaceRoot: "/workspace" });

    expect(profile).toMatchObject({
      id: CODE_AGENT_PROFILE_ID,
      name: "Code Agent",
      workspaceRoot: "/workspace",
      goals: expect.arrayContaining([
        "Understand the repository before editing"
      ]),
      nonGoals: expect.arrayContaining([
        "Bypass permission checks"
      ])
    });
    expect(profile.systemPrompt).toContain("permission runtime");
  });

  it("creates a code-agent system prompt without owning the runtime loop", () => {
    const prompt = createCodeAgentSystemPrompt();

    expect(prompt).toContain("local coding profile");
    expect(prompt).toContain("Use write/edit/shell tools only through the permission runtime");
    expect(prompt).not.toContain("ignore permissions");
  });

  it("creates ask-on-write permission policy defaults", () => {
    const policy = createCodeAgentPermissionPolicy({ timeoutMs: 1000 });

    expect(policy.profile).toBe("ask-on-write");
    expect(policy.timeoutMs).toBe(1000);
    expect(policy.resolver).toBeTypeOf("function");
  });

  it("denies destructive shell commands before delegating", async () => {
    const resolver = createCodeAgentPermissionResolver(() => ({
      action: "allow",
      remember: "once",
      source: "host"
    }));

    await expect(resolver(shellRequest("rm -rf dist"))).resolves.toMatchObject({
      action: "deny",
      source: "profile",
      reason: expect.stringContaining("Destructive shell command")
    });
    expect(isDestructiveShellCommand("git reset --hard HEAD")).toBe(true);
    expect(isDestructiveShellCommand("pnpm test")).toBe(false);
  });

  it("delegates non-destructive write and execute decisions to the host", async () => {
    const resolver = createCodeAgentPermissionResolver((request) => ({
      action: request.subject.effect === "execute" ? "allow" : "deny",
      remember: "once",
      source: "host",
      ...(request.subject.effect === "write" ? { reason: "host denied write" } : {})
    }));

    await expect(resolver(shellRequest("pnpm test"))).resolves.toMatchObject({
      action: "allow",
      source: "host"
    });
    await expect(resolver(writeRequest())).resolves.toMatchObject({
      action: "deny",
      reason: "host denied write"
    });
  });

  it("creates a plugin bundle from existing first-party capabilities", async () => {
    const runtime = createAgentRuntime({
      plugins: createCodeAgentPlugins({
        workspaceRoot: "/workspace",
        includeOperations: true
      })
    });

    await runtime.run({ input: "initialize", providerId: "missing", runId: "run-code-bundle" });

    expect(runtime.listCapabilityDescriptors?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool", name: "fs_read", ownerPluginId: "code-agent-filesystem" }),
      expect.objectContaining({ type: "tool", name: "shell_exec", ownerPluginId: "code-agent-shell" }),
      expect.objectContaining({ type: "tool", name: "git_status", ownerPluginId: "code-agent-git" }),
      expect.objectContaining({ type: "operation", name: "audit.summary", ownerPluginId: "code-agent-audit-export" }),
      expect.objectContaining({ type: "operation", name: "eval.run", ownerPluginId: "code-agent-eval-runner" })
    ]));
  });

  it("creates runtime options without host or CLI dependencies", () => {
    const options = createCodeAgentRuntimeOptions({
      workspaceRoot: "/workspace",
      includeOperations: false
    });

    expect(options.plugins).toHaveLength(3);
    expect(options.permissions?.profile).toBe("ask-on-write");
  });

  it("builds deterministic repo context from explicit inputs", () => {
    const context = buildRepoContext({
      workspaceRoot: "/repo",
      gitStatus: " M packages/a.ts\n?? packages/b.ts\n",
      activeFiles: ["packages/b.ts", "packages/a.ts", "packages/a.ts"],
      packageScripts: {
        build: "tsc",
        test: "vitest run",
        empty: ""
      },
      notes: ["Prefer existing helpers", ""]
    });

    expect(context).toEqual({
      workspaceRoot: "/repo",
      gitStatus: "M packages/a.ts\n?? packages/b.ts",
      activeFiles: ["packages/a.ts", "packages/b.ts"],
      packageScripts: {
        build: "tsc",
        test: "vitest run"
      },
      notes: ["Prefer existing helpers"]
    });
    expect(renderRepoContext(context)).toContain("Active files: packages/a.ts, packages/b.ts");
  });

  it("discovers validation commands from scripts and changed files", () => {
    expect(discoverTestCommands({
      packageManager: "pnpm",
      changedFiles: ["packages/profile-code-agent/src/profile.ts"],
      packageScripts: {
        test: "vitest run",
        typecheck: "tsc --noEmit",
        build: "tsc"
      }
    })).toEqual([
      expect.objectContaining({ command: "pnpm test", confidence: "high" }),
      expect.objectContaining({ command: "pnpm typecheck", confidence: "high" }),
      expect.objectContaining({ command: "pnpm build", confidence: "medium" })
    ]);
  });
});

function shellRequest(command: string): PermissionRequest {
  return {
    runId: "run-code",
    turn: 1,
    toolCallId: "call-shell",
    attempt: 1,
    call: { id: "call-shell", name: "shell_exec", input: { command } },
    subject: { toolName: "shell_exec", effect: "execute", commandSummary: command },
    profile: "ask-on-write"
  };
}

function writeRequest(): PermissionRequest {
  return {
    runId: "run-code",
    turn: 1,
    toolCallId: "call-write",
    attempt: 1,
    call: { id: "call-write", name: "fs_write", input: { path: "file.ts", content: "x" } },
    subject: { toolName: "fs_write", effect: "write", resourceSummary: "file.ts" },
    profile: "ask-on-write"
  };
}
