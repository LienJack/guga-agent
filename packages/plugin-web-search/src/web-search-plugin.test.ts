import { describe, expect, it } from "vitest";
import { AgentEventType, createAgentRuntime } from "@guga-agent/core";
import { createMockWebSearchBackend, createWebSearchPlugin } from "./index";

describe("createWebSearchPlugin", () => {
  it("registers one model-visible web_search tool with extension ownership", async () => {
    const runtime = createAgentRuntime({
      plugins: [createWebSearchPlugin({
        pluginId: "web-search",
        backend: createMockWebSearchBackend()
      })]
    });

    const result = await runtime.run({ input: "initialize", providerId: "missing", runId: "run-web-search-plugin" });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.PluginCapabilityRegistered,
      capability: "tool",
      pluginId: "web-search",
      name: "web_search"
    }));
    expect(runtime.listCapabilityDescriptors()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "tool",
        name: "web_search",
        source: "plugin",
        layer: "extension",
        ownerPluginId: "web-search",
        owner: { kind: "extension", id: "web-search", packageName: "@guga-agent/plugin-web-search" },
        extension: expect.objectContaining({
          id: "web-search",
          source: { kind: "first-party", packageName: "@guga-agent/plugin-web-search" }
        })
      })
    ]));
    expect(runtime.listCapabilityDescriptors().filter((descriptor) => descriptor.type === "tool" && descriptor.name === "web_search")).toHaveLength(1);
    await runtime.dispose();
  });

  it("can register a disabled missing-backend tool without throwing", async () => {
    const runtime = createAgentRuntime({
      plugins: [createWebSearchPlugin({ providerId: "brave" })]
    });

    const result = await runtime.run({ input: "initialize", providerId: "missing", runId: "run-web-search-missing" });

    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_NOT_FOUND" } });
    expect(runtime.listCapabilityDescriptors()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool", name: "web_search", ownerPluginId: "guga-web-search" })
    ]));
    await runtime.dispose();
  });
});
