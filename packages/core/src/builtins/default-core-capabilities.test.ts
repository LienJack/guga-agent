import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../registry/capability-registry";
import { createMockProvider } from "../testing/mock-provider";
import { createTestTool } from "../testing/test-tool";
import { createDefaultCoreCapabilities, registerBuiltInCoreCapabilities } from "./default-core-capabilities";

describe("default core capabilities", () => {
  it("registers supplied built-in providers, models, and tools with built-in descriptor metadata", () => {
    const registry = new CapabilityRegistry();
    const provider = createMockProvider([{ type: "final", content: "ok" }], { id: "builtin-provider" });
    const tool = createTestTool({ name: "builtin_tool", content: "ok" });

    const result = registerBuiltInCoreCapabilities(registry, {
      providers: [provider],
      models: [{
        providerId: "builtin-provider",
        modelId: "builtin-model",
        capabilities: { usage: "optional" }
      }],
      tools: [tool]
    });

    expect(result.registered).toEqual({
      providers: ["builtin-provider"],
      models: ["builtin-provider/builtin-model"],
      tools: ["builtin_tool"]
    });
    expect(registry.listCapabilityDescriptors()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "provider",
        name: "builtin-provider",
        source: "built-in",
        layer: "built-in-core",
        owner: { kind: "core", id: "guga-core", packageName: "@guga-agent/core" }
      }),
      expect.objectContaining({
        type: "model",
        name: "builtin-provider/builtin-model",
        source: "built-in",
        layer: "built-in-core",
        owner: { kind: "core", id: "guga-core", packageName: "@guga-agent/core" }
      }),
      expect.objectContaining({
        type: "tool",
        name: "builtin_tool",
        source: "built-in",
        layer: "built-in-core",
        owner: { kind: "core", id: "guga-core", packageName: "@guga-agent/core" }
      })
    ]));
  });

  it("creates default built-in filesystem, git, shell, and AI SDK bridge capabilities from injected backends", async () => {
    const capabilities = createDefaultCapabilitiesFixture();

    expect(capabilities.tools?.map((tool) => tool.name).sort()).toEqual([
      "fs_edit",
      "fs_list",
      "fs_read",
      "fs_search",
      "fs_write",
      "git_commit_message",
      "git_diff",
      "git_status",
      "shell_exec"
    ]);
    expect(capabilities.providers?.map((provider) => provider.id)).toEqual(["ai-sdk"]);
    expect(capabilities.models).toEqual([
      expect.objectContaining({ providerId: "ai-sdk", modelId: "test-model" })
    ]);

    await expect(capabilities.tools?.find((tool) => tool.name === "fs_read")?.execute({ path: "README.md" }, {
      call: { id: "call-fs", name: "fs_read", input: { path: "README.md" } }
    })).resolves.toEqual({ ok: true, content: "file" });
    await expect(capabilities.tools?.find((tool) => tool.name === "git_status")?.execute({}, {
      call: { id: "call-git", name: "git_status", input: {} }
    })).resolves.toEqual({ ok: true, content: "clean" });
  });
});

function createDefaultCapabilitiesFixture() {
  return createDefaultCoreCapabilities({
    filesystem: {
      workspaceRoot: process.cwd(),
      backend: {
        readText: async () => "file",
        writeText: async () => undefined,
        list: async () => ["README.md"],
        search: async () => ["README.md"]
      }
    },
    git: {
      workspaceRoot: process.cwd(),
      backend: {
        status: async () => "clean",
        diff: async () => ""
      }
    },
    shell: {
      workspaceRoot: process.cwd(),
      backend: {
        execute: async () => ({ stdout: "ok", stderr: "", exitCode: 0 })
      }
    },
    aiSdk: {
      config: { modelId: "test-model", mode: "openai-compatible" as const },
      factory: {
        generateText: async () => ({ text: "ok", finishReason: "stop" }),
        modelFactory: () => ({})
      }
    }
  });
}
