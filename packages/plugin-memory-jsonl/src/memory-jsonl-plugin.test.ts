import { describe, expect, it } from "vitest";
import { createAgentRuntime, type CapabilityDescriptor } from "@guga-agent/core";
import { createMemoryJsonlPlugin } from "./memory-jsonl-plugin";

describe("createMemoryJsonlPlugin", () => {
  it("registers discoverable memory JSONL operation descriptors", async () => {
    const runtime = createAgentRuntime({
      plugins: [createMemoryJsonlPlugin({ pluginId: "memory-jsonl-test" })]
    });

    await runtime.run({ input: "missing provider", providerId: "missing", runId: "run-memory-jsonl" });
    const descriptors = runtime.listCapabilityDescriptors?.() as CapabilityDescriptor[] | undefined;

    expect(descriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "operation",
        name: "memory.jsonl",
        source: "plugin",
        ownerPluginId: "memory-jsonl-test",
        trust: expect.objectContaining({
          level: "first-party",
          scopes: [
            { kind: "memory", access: "read" },
            { kind: "memory", access: "write" }
          ]
        })
      })
    ]));
    for (const name of [
      "memory.jsonl.review",
      "memory.jsonl.review_markdown",
      "memory.jsonl.health",
      "memory.jsonl.audit_snapshot",
      "memory.jsonl.retrieval",
      "memory.jsonl.curated_markdown"
    ]) {
      expect(descriptors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "operation",
          name,
          source: "plugin",
          ownerPluginId: "memory-jsonl-test",
          trust: expect.objectContaining({
            level: "first-party",
            scopes: [{ kind: "memory", access: "read" }]
          })
        })
      ]));
    }
    await runtime.dispose();
  });
});
