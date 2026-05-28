import { describe, expect, it } from "vitest";
import { createAgentRuntime, createMockProvider } from "@guga-agent/core";
import { createGitPlugin } from "./git-plugin";

describe("git plugin runtime integration", () => {
  it("runs git_status through the core plugin registry and execution pipeline", async () => {
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [
        createGitPlugin({
          workspaceRoot: "/workspace",
          backend: {
            async status() {
              return " M README.md";
            },
            async diff() {
              return "";
            }
          }
        })
      ]
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "status", name: "git_status", input: {} }] },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.role === "tool" ? request.messages.at(-1)!.content : "missing tool result"
      })
    ]));

    const result = await runtime.run({ input: "status", providerId: "mock", runId: "run-git-status" });

    expect(result).toMatchObject({ ok: true, finalAnswer: " M README.md" });
    await runtime.dispose();
  });
});
