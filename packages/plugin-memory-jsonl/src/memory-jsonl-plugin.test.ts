import { describe, expect, it } from "vitest";
import { createAgentRuntime, type CapabilityDescriptor } from "@guga-agent/core";
import {
  createMemoryJsonlPlugin,
  MEMORY_JSONL_OPERATION_NAME,
  MEMORY_JSONL_OPERATION_NAMESPACE,
  MEMORY_JSONL_OPERATION_NAMES,
  MEMORY_JSONL_READ_OPERATION_NAMES
} from "./memory-jsonl-plugin";

describe("createMemoryJsonlPlugin", () => {
  it("exports stable memory JSONL operation names", () => {
    expect(MEMORY_JSONL_OPERATION_NAME).toBe("memory.jsonl");
    expect(MEMORY_JSONL_OPERATION_NAMESPACE).toBe("memory-jsonl");
    expect(MEMORY_JSONL_READ_OPERATION_NAMES).toEqual([
      "memory.jsonl.review",
      "memory.jsonl.review_report",
      "memory.jsonl.review_markdown",
      "memory.jsonl.health",
      "memory.jsonl.audit_snapshot",
      "memory.jsonl.retrieval",
      "memory.jsonl.curated_markdown"
    ]);
    expect(MEMORY_JSONL_OPERATION_NAMES).toEqual([
      "memory.jsonl",
      ...MEMORY_JSONL_READ_OPERATION_NAMES
    ]);
  });

  it("registers discoverable memory JSONL operation descriptors", async () => {
    const runtime = createAgentRuntime({
      plugins: [createMemoryJsonlPlugin({ pluginId: "memory-jsonl-test" })]
    });

    await runtime.run({ input: "missing provider", providerId: "missing", runId: "run-memory-jsonl" });
    const descriptors = runtime.listCapabilityDescriptors?.() as CapabilityDescriptor[] | undefined;

    expect(descriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "operation",
        name: MEMORY_JSONL_OPERATION_NAME,
        source: "plugin",
        namespace: MEMORY_JSONL_OPERATION_NAMESPACE,
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
    for (const name of MEMORY_JSONL_READ_OPERATION_NAMES) {
      expect(descriptors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "operation",
          name,
          source: "plugin",
          namespace: MEMORY_JSONL_OPERATION_NAMESPACE,
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
