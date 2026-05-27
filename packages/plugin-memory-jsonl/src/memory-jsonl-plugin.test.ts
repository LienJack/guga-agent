import { describe, expect, it } from "vitest";
import { createAgentRuntime } from "@guga-agent/core";
import { createMemoryJsonlPlugin } from "./memory-jsonl-plugin";

describe("createMemoryJsonlPlugin", () => {
  it("registers a discoverable memory JSONL operation descriptor", async () => {
    const runtime = createAgentRuntime({
      plugins: [createMemoryJsonlPlugin({ pluginId: "memory-jsonl-test" })]
    });

    await runtime.run({ input: "missing provider", providerId: "missing", runId: "run-memory-jsonl" });

    expect(runtime.listCapabilityDescriptors?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "operation",
        name: "memory.jsonl",
        source: "plugin",
        ownerPluginId: "memory-jsonl-test",
        trust: expect.objectContaining({ level: "first-party" })
      })
    ]));
    await runtime.dispose();
  });
});
