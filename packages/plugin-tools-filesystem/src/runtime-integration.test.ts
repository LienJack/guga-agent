import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEventType, createAgentRuntime, createMockProvider } from "@guga-agent/core";
import { createFilesystemPlugin } from "./filesystem-plugin";

const tempRoots: string[] = [];

describe("filesystem plugin runtime integration", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("runs fs_write through core permission, pipeline, and model-visible result flow", async () => {
    const root = await tempWorkspace();
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createFilesystemPlugin({ workspaceRoot: root })],
      permissions: {
        resolver: () => ({ action: "allow", remember: "once", source: "host" })
      }
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "write", name: "fs_write", input: { path: "a.txt", content: "ok" } }] },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.role === "tool" ? request.messages.at(-1)!.content : "missing tool result"
      })
    ]));

    const result = await runtime.run({ input: "write", providerId: "mock", runId: "run-fs-write" });

    expect(result).toMatchObject({ ok: true, finalAnswer: "Wrote a.txt" });
    await expect(readFile(join(root, "a.txt"), "utf8")).resolves.toBe("ok");
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.PermissionRequested);
    await runtime.dispose();
  });

  it("returns permission denial as a model-visible fs_write result", async () => {
    const root = await tempWorkspace();
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [createFilesystemPlugin({ workspaceRoot: root })],
      permissions: {
        resolver: () => ({ action: "deny", remember: "once", source: "host", reason: "not allowed" })
      }
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "write", name: "fs_write", input: { path: "a.txt", content: "ok" } }] },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.role === "tool" ? request.messages.at(-1)!.content : "missing tool result"
      })
    ]));

    const result = await runtime.run({ input: "write", providerId: "mock", runId: "run-fs-deny" });

    expect(result).toMatchObject({ ok: true, finalAnswer: "TOOL_PERMISSION_DENIED: not allowed" });
    await runtime.dispose();
  });
});

async function tempWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-fs-runtime-"));
  tempRoots.push(root);
  return root;
}
