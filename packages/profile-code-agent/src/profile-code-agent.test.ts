import { describe, expect, it } from "vitest";
import type { PermissionRequest } from "@guga-agent/core";
import { createCodeAgentPermissionPolicy, createCodeAgentPermissionResolver, isDestructiveShellCommand } from "./permissions";
import { CODE_AGENT_PROFILE_ID, createCodeAgentProfile, createCodeAgentSystemPrompt } from "./profile";

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
