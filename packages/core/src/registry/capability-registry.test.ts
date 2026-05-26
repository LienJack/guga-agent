import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "./capability-registry";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";

const provider: Provider = {
  id: "mock",
  generate: () => ({ type: "final", content: "done" })
};

const tool: ToolDefinition = {
  name: "echo",
  description: "Echo input",
  inputSchema: {},
  effect: "read",
  execute: () => ({ ok: true, content: "echo" })
};

const model: ModelMetadata = {
  providerId: "mock",
  modelId: "mock-small",
  purposes: ["primary"],
  capabilities: { toolCalling: true, usage: "optional" }
};

describe("CapabilityRegistry", () => {
  it("registers and resolves providers and tools", () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(provider);
    registry.registerModel(model);
    registry.registerTool(tool);

    expect(registry.requireProvider("mock")).toBe(provider);
    expect(registry.getModel("mock", "mock-small")).toBe(model);
    expect(registry.listModels()).toEqual([model]);
    expect(registry.requireTool("echo")).toBe(tool);
    expect(registry.listTools()).toEqual([tool]);
  });

  it("fails explicitly for missing providers and tools", () => {
    const registry = new CapabilityRegistry();

    expect(() => registry.requireProvider("missing")).toThrow("Provider not registered: missing");
    expect(() => registry.requireTool("missing")).toThrow("Tool not registered: missing");
  });

  it("does not silently overwrite duplicate capabilities", () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(provider);
    registry.registerModel(model);
    registry.registerTool(tool);

    expect(() => registry.registerProvider(provider)).toThrow("Provider already registered: mock");
    expect(() => registry.registerModel(model)).toThrow("Model already registered: mock/mock-small");
    expect(() => registry.registerTool(tool)).toThrow("Tool already registered: echo");
  });

  it("removes model metadata by provider and model id", () => {
    const registry = new CapabilityRegistry();
    registry.registerModel(model);

    registry.removeModel("mock", "mock-small");

    expect(registry.getModel("mock", "mock-small")).toBeUndefined();
    expect(registry.listModels()).toEqual([]);
  });
});
