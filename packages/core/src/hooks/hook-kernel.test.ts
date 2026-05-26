import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import { HookEffect, HookPhase } from "../contracts/hooks";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "./hook-kernel";

const call = { id: "call-1", name: "echo", input: { value: "hi" } };

describe("HookKernel", () => {
  it("runs pre-tool gates in plugin load order and allows when every hook allows", async () => {
    const eventBus = new EventBus();
    const kernel = new HookKernel({ eventBus });
    const order: string[] = [];

    kernel.registerHook("plugin-b", 1, {
      id: "gate-b",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        order.push("b");
        return { type: "allow" };
      }
    });
    kernel.registerHook("plugin-a", 0, {
      id: "gate-a",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        order.push("a");
        return { type: "allow" };
      }
    });

    const result = await kernel.runPreToolGate({
      runId: "run-hooks-1",
      turn: 0,
      call,
      tools: []
    });

    expect(result).toMatchObject({ ok: true, decision: { type: "allow" } });
    expect(order).toEqual(["a", "b"]);
    expect(eventBus.events.filter((event) => event.type === AgentEventType.HookDecision)).toHaveLength(2);
  });

  it("uses first deny wins and does not run later gate hooks", async () => {
    const kernel = new HookKernel({ eventBus: new EventBus() });
    const order: string[] = [];

    kernel.registerHook("plugin-a", 0, {
      id: "deny-a",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        order.push("a");
        return { type: "deny", reason: "blocked" };
      }
    });
    kernel.registerHook("plugin-b", 1, {
      id: "gate-b",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        order.push("b");
        return { type: "allow" };
      }
    });

    const result = await kernel.runPreToolGate({
      runId: "run-hooks-2",
      turn: 0,
      call,
      tools: []
    });

    expect(result).toMatchObject({
      ok: true,
      decision: { type: "deny", reason: "blocked" },
      deniedBy: { pluginId: "plugin-a", id: "deny-a" }
    });
    expect(order).toEqual(["a"]);
  });

  it("allows pre-tool execution when no gate hooks are registered", async () => {
    const result = await new HookKernel({ eventBus: new EventBus() }).runPreToolGate({
      runId: "run-hooks-empty",
      turn: 0,
      call,
      tools: []
    });

    expect(result).toEqual({ ok: true, decision: { type: "allow" } });
  });

  it("returns structured hook failure and publishes a hook failure event when a gate throws", async () => {
    const eventBus = new EventBus();
    const kernel = new HookKernel({ eventBus });
    kernel.registerHook("plugin-a", 0, {
      id: "throwing-gate",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        throw new Error("gate exploded");
      }
    });

    const result = await kernel.runPreToolGate({
      runId: "run-hooks-failure",
      turn: 0,
      call,
      tools: []
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HOOK_FAILED", message: "gate exploded" },
      failedHook: { pluginId: "plugin-a", id: "throwing-gate" }
    });
    expect(eventBus.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.HookFailure,
        runId: "run-hooks-failure",
        pluginId: "plugin-a",
        hookId: "throwing-gate",
        message: "gate exploded"
      })
    );
  });

  it("collects shutdown hook failures without skipping later shutdown hooks", async () => {
    const eventBus = new EventBus();
    const kernel = new HookKernel({ eventBus });
    const order: string[] = [];

    kernel.registerHook("plugin-a", 0, {
      id: "shutdown-a",
      phase: HookPhase.RuntimeShutdown,
      effect: HookEffect.Observe,
      handler() {
        order.push("a");
        throw new Error("shutdown failed");
      }
    });
    kernel.registerHook("plugin-b", 1, {
      id: "shutdown-b",
      phase: HookPhase.RuntimeShutdown,
      effect: HookEffect.Observe,
      handler() {
        order.push("b");
      }
    });

    const result = await kernel.runRuntimeShutdown({ runId: "run-shutdown" });

    expect(order).toEqual(["a", "b"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      hook: { pluginId: "plugin-a", id: "shutdown-a" },
      error: { code: "HOOK_FAILED", message: "shutdown failed" }
    });
  });

  it("runs lifecycle observe hooks with the same deterministic ordering metadata", async () => {
    const kernel = new HookKernel({ eventBus: new EventBus() });
    const order: string[] = [];

    kernel.registerHook("plugin-b", 1, {
      id: "start-b",
      phase: HookPhase.RuntimeStart,
      effect: HookEffect.Observe,
      handler() {
        order.push("b");
      }
    });
    kernel.registerHook("plugin-a", 0, {
      id: "start-a",
      phase: HookPhase.RuntimeStart,
      effect: HookEffect.Observe,
      handler() {
        order.push("a");
      }
    });

    const result = await kernel.runRuntimeStart({ runId: "run-start" });

    expect(result.failures).toEqual([]);
    expect(order).toEqual(["a", "b"]);
  });
});
