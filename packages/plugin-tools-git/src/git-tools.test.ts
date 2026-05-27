import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@guga-agent/core";
import type { GitBackend } from "./git-plugin";
import { createGitPlugin, isDangerousGitOperation } from "./git-plugin";

describe("git tools", () => {
  it("registers safe git helpers only", () => {
    const tools = registeredTools("/workspace");

    expect(tools.map((tool) => tool.name)).toEqual(["git_status", "git_diff", "git_commit_message"]);
    expect(tools.every((tool) => tool.effect === "read")).toBe(true);
    expect(tools.find((tool) => tool.name === "git_status")?.runtime).toMatchObject({
      permission: { defaultAction: "allow" },
      scheduler: { concurrency: "read-only" },
      renderer: { category: "git" }
    });
  });

  it("executes status and diff through a replaceable backend", async () => {
    const tools = registeredTools("/workspace", {
      async status() {
        return " M README.md";
      },
      async diff(_root, path) {
        return `diff ${path ?? "all"}`;
      }
    });

    await expect(tools[0]!.execute({}, { call: { id: "status", name: "git_status", input: {} } })).resolves.toEqual({
      ok: true,
      content: " M README.md"
    });
    await expect(tools[1]!.execute({ path: "README.md" }, { call: { id: "diff", name: "git_diff", input: {} } })).resolves.toEqual({
      ok: true,
      content: "diff README.md"
    });
  });

  it("blocks dangerous git operation wording in commit assistance", async () => {
    const tool = registeredTools("/workspace")[2]!;

    expect(tool.execute({ summary: "push to origin" }, { call: { id: "commit", name: "git_commit_message", input: {} } })).toMatchObject({
      ok: false,
      error: { code: "GIT_DANGEROUS_OPERATION_BLOCKED" }
    });
    expect(isDangerousGitOperation("reset --hard HEAD")).toBe(true);
  });
});

function registeredTools(workspaceRoot: string, backend?: GitBackend): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  createGitPlugin({
    workspaceRoot,
    backend: backend ?? {
      async status() {
        return "";
      },
      async diff() {
        return "";
      }
    }
  }).init({
    pluginId: "test",
    registerProvider() {},
    registerModel() {},
    registerTool(tool) {
      tools.push(tool);
    },
    registerHook() {}
  });
  return tools;
}
