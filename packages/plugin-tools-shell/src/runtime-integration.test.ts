import { describe, expect, it, vi } from "vitest";
import { createAgentRuntime, createMockProvider } from "@guga-agent/core";
import { createShellPlugin } from "./shell-plugin";

describe("shell plugin runtime integration", () => {
  it("filters shell_exec from headless provider projection before backend execution", async () => {
    const execute = vi.fn().mockResolvedValue({ stdout: "no", stderr: "", exitCode: 0 });
    const projectedTools: string[][] = [];
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createShellPlugin({ workspaceRoot: "/workspace", backend: { execute } })],
      permissions: { profile: "headless" }
    });
    runtime.registerProvider(createMockProvider([
      (request) => ({
        type: "final",
        content: (projectedTools.push(request.tools.map((tool) => tool.name)), request.tools.map((tool) => tool.name).join(","))
      })
    ]));

    const result = await runtime.run({ input: "run shell", providerId: "mock", runId: "run-shell-headless" });

    expect(execute).not.toHaveBeenCalled();
    expect(projectedTools[0]).not.toContain("shell_exec");
    expect(result).toMatchObject({
      ok: true,
      finalAnswer: ""
    });
    await runtime.dispose();
  });
});
