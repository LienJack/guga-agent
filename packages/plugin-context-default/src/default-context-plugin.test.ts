import { describe, expect, it } from "vitest";
import { AgentEventType, CapabilityRegistry, EventBus, HookKernel, PluginHost } from "@guga-agent/core";
import { createDefaultContextPlugin } from "./default-context-plugin";
import { DEFAULT_CONTEXT_POLICY_ID } from "./default-context-policy";

describe("createDefaultContextPlugin", () => {
  it("registers a replaceable context policy and hooks through the plugin host", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const host = new PluginHost({
      plugins: [createDefaultContextPlugin({ pluginId: "default-context" })],
      registry,
      eventBus,
      hookKernel
    });

    await host.initialize({ runId: "run-default-context" });

    expect(registry.listContextPolicies()).toContainEqual(expect.objectContaining({
      id: DEFAULT_CONTEXT_POLICY_ID
    }));
    expect(eventBus.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.PluginCapabilityRegistered,
      capability: "context-policy",
      name: DEFAULT_CONTEXT_POLICY_ID
    }));

    const result = await hookKernel.runContextHook("context.compact.before", {
      runId: "run-default-context",
      turn: 0,
      runtimeContextId: "runtime-1"
    });
    expect(result).toMatchObject({
      ok: true,
      decisions: [expect.objectContaining({ kind: "gate", allowed: true })]
    });
  });
});
