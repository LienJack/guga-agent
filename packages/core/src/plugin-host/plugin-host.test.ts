import { describe, expect, it } from "vitest";
import { CoreError } from "../contracts/errors";
import { AgentEventType } from "../contracts/events";
import { HookEffect, HookPhase } from "../contracts/hooks";
import type { LocalPlugin } from "../contracts/plugins";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { createMockProvider } from "../testing/mock-provider";
import { createTestTool } from "../testing/test-tool";
import { PluginHost } from "./plugin-host";

describe("PluginHost", () => {
  it("initializes plugins through a restricted context and registers capabilities", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const plugin: LocalPlugin = {
      id: "example",
      init(context) {
        context.registerProvider(createMockProvider([{ type: "final", content: "ok" }], { id: "from-plugin" }));
        context.registerTool(createTestTool({ name: "from-plugin-tool", content: "ok" }));
        context.registerHook({
          id: "allow-tool",
          phase: HookPhase.PreToolGate,
          effect: HookEffect.Gate,
          handler() {
            return { type: "allow" };
          }
        });
      }
    };

    const result = await new PluginHost({ plugins: [plugin], registry, hookKernel, eventBus }).initialize({
      runId: "run-plugin-init"
    });

    expect(result).toEqual({ ok: true });
    expect(registry.requireProvider("from-plugin").id).toBe("from-plugin");
    expect(registry.requireTool("from-plugin-tool").name).toBe("from-plugin-tool");
    expect(
      await hookKernel.runPreToolGate({
        runId: "run-gate",
        turn: 0,
        call: { id: "call-1", name: "from-plugin-tool", input: {} },
        tools: []
      })
    ).toMatchObject({ ok: true, decision: { type: "allow" } });
    expect(eventBus.events.map((event) => event.type)).toEqual([
      AgentEventType.PluginCapabilityRegistered,
      AgentEventType.PluginCapabilityRegistered,
      AgentEventType.PluginCapabilityRegistered,
      AgentEventType.PluginInitialized,
      AgentEventType.HookDecision
    ]);
  });

  it("initializes an empty plugin list as a no-op", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });

    const result = await new PluginHost({ plugins: [], registry, hookKernel, eventBus }).initialize({
      runId: "run-empty-plugins"
    });

    expect(result).toEqual({ ok: true });
    expect(eventBus.events).toEqual([]);
  });

  it("reports init failure and cleans up initialized and partially initialized plugin state", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(createMockProvider([{ type: "final", content: "host" }], { id: "host" }));
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const shutdowns: string[] = [];

    const first: LocalPlugin = {
      id: "first",
      init(context) {
        context.registerProvider(createMockProvider([{ type: "final", content: "first" }], { id: "first-provider" }));
      },
      shutdown() {
        shutdowns.push("first");
      }
    };
    const second: LocalPlugin = {
      id: "second",
      init(context) {
        context.registerTool(createTestTool({ name: "partial-tool", content: "partial" }));
        throw new Error("init exploded");
      }
    };

    const result = await new PluginHost({ plugins: [first, second], registry, hookKernel, eventBus }).initialize({
      runId: "run-init-fails"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PLUGIN_INIT_FAILED", message: "init exploded" }
    });
    expect(shutdowns).toEqual(["first"]);
    expect(registry.getProvider("host")).toBeDefined();
    expect(registry.getProvider("first-provider")).toBeUndefined();
    expect(registry.getTool("partial-tool")).toBeUndefined();
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.PluginFailure,
        pluginId: "second",
        failure: "init",
        code: "PLUGIN_INIT_FAILED"
      })
    );
  });

  it("preserves duplicate capability errors and marks the source plugin", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(createMockProvider([{ type: "final", content: "host" }], { id: "duplicate" }));
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });

    const plugin: LocalPlugin = {
      id: "duplicate-plugin",
      init(context) {
        context.registerProvider(createMockProvider([{ type: "final", content: "plugin" }], { id: "duplicate" }));
      }
    };

    const result = await new PluginHost({ plugins: [plugin], registry, hookKernel, eventBus }).initialize({
      runId: "run-duplicate"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_ALREADY_REGISTERED" }
    });
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.PluginFailure,
        pluginId: "duplicate-plugin",
        code: "CAPABILITY_ALREADY_REGISTERED"
      })
    );
  });

  it("runs shutdown hooks and plugin shutdown even when failures occur", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const order: string[] = [];
    const plugin: LocalPlugin = {
      id: "shutdown-plugin",
      init(context) {
        context.registerHook({
          id: "shutdown-hook",
          phase: HookPhase.RuntimeShutdown,
          effect: HookEffect.Observe,
          handler() {
            order.push("hook");
            throw new Error("hook shutdown failed");
          }
        });
      },
      shutdown() {
        order.push("plugin");
        throw new Error("plugin shutdown failed");
      }
    };
    const host = new PluginHost({ plugins: [plugin], registry, hookKernel, eventBus });
    await host.initialize({ runId: "run-before-shutdown" });

    const result = await host.shutdown({ runId: "run-shutdown" });

    expect(order).toEqual(["hook", "plugin"]);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.PluginShutdown,
        runId: "run-shutdown",
        pluginId: "shutdown-plugin",
        status: "failed"
      })
    );
  });

  it("does not require hosts to manually register plugin capabilities", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const plugin: LocalPlugin = {
      id: "self-contained",
      init(context) {
        context.registerProvider(createMockProvider([{ type: "final", content: "ok" }], { id: "plugin-provider" }));
      }
    };

    await new PluginHost({ plugins: [plugin], registry, hookKernel, eventBus }).initialize({
      runId: "run-self-contained"
    });

    expect(registry.getProvider("plugin-provider")).toBeDefined();
  });
});
