import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "./capability-registry";
import type { Provider } from "../contracts/provider";
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

describe("CapabilityRegistry", () => {
  it("registers and resolves providers and tools", () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(provider);
    registry.registerTool(tool);

    expect(registry.requireProvider("mock")).toBe(provider);
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
    registry.registerTool(tool);

    expect(() => registry.registerProvider(provider)).toThrow("Provider already registered: mock");
    expect(() => registry.registerTool(tool)).toThrow("Tool already registered: echo");
  });
});
