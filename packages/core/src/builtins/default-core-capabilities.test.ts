import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../registry/capability-registry";
import { createMockProvider } from "../testing/mock-provider";
import { createTestTool } from "../testing/test-tool";
import { registerBuiltInCoreCapabilities } from "./default-core-capabilities";

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
});
