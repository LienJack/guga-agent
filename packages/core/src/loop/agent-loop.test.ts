import { describe, expect, it } from "vitest";
import { AgentLoop } from "./agent-loop";
import { AgentEventType } from "../contracts/events";
import { HookEffect, HookPhase } from "../contracts/hooks";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { createMockProvider } from "../testing/mock-provider";
import { createTestTool } from "../testing/test-tool";

describe("AgentLoop", () => {
  it("completes a successful tool-calling run", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "echo", input: { value: "hello" } }] },
        { type: "final", content: "The tool said hello" }
      ])
    );
    registry.registerTool(createTestTool({ name: "echo", content: "hello" }));

    const result = await new AgentLoop({ registry, eventBus }).run({
      input: "Use echo",
      providerId: "mock",
      runId: "run-1"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "The tool said hello" });
    expect(eventBus.events.map((event) => event.type)).toEqual([
      AgentEventType.RunStarted,
      AgentEventType.ModelRequested,
      AgentEventType.ModelEvent,
      AgentEventType.ModelEvent,
      AgentEventType.ModelResponded,
      AgentEventType.ToolCalled,
      AgentEventType.ToolResult,
      AgentEventType.ModelRequested,
      AgentEventType.ModelEvent,
      AgentEventType.ModelEvent,
      AgentEventType.ModelResponded,
      AgentEventType.RunFinished
    ]);
  });

  it("returns tool failures to the provider as observations", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "fail", input: {} }] },
        (request) => {
          const last = request.messages.at(-1);
          return {
            type: "final",
            content: last?.role === "tool" && last.isError ? "Recovered from tool failure" : "missing failure"
          };
        }
      ])
    );
    registry.registerTool(createTestTool({ name: "fail", failure: { code: "FAILED", message: "Nope" } }));

    const result = await new AgentLoop({ registry }).run({
      input: "Use failing tool",
      providerId: "mock",
      runId: "run-2"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "Recovered from tool failure" });
    expect(result.events.some((event) => event.type === AgentEventType.ToolResult)).toBe(true);
  });

  it("normalizes thrown tool errors into model-visible observations", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "boom", input: {} }] },
        (request) => {
          const last = request.messages.at(-1);
          return {
            type: "final",
            content: last?.role === "tool" && last.isError ? last.content : "missing thrown error"
          };
        }
      ])
    );
    registry.registerTool(createTestTool({ name: "boom", throws: new Error("Kaboom") }));

    const result = await new AgentLoop({ registry }).run({
      input: "Use throwing tool",
      providerId: "mock",
      runId: "run-throws"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "TOOL_EXECUTION_FAILED: Kaboom" });
  });

  it("fails explicitly when a provider asks for an unregistered tool", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "missing", input: {} }] }
      ])
    );

    const result = await new AgentLoop({ registry }).run({
      input: "Use missing tool",
      providerId: "mock",
      runId: "run-3"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_FOUND", message: "Tool not registered: missing" }
    });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.Error);
  });

  it("fails explicitly when the provider is missing", async () => {
    const result = await new AgentLoop({ registry: new CapabilityRegistry() }).run({
      input: "hello",
      providerId: "missing",
      runId: "run-4"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_NOT_FOUND", message: "Provider not registered: missing" }
    });
  });

  it("normalizes thrown provider errors into run failures and events", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider({
      id: "throwing",
      generate() {
        throw new Error("Provider exploded");
      }
    });

    const result = await new AgentLoop({ registry }).run({
      input: "hello",
      providerId: "throwing",
      runId: "run-provider-throws"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_FAILED", message: "Provider exploded" }
    });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.Error);
  });


  it("stops when the provider never produces a final answer", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "echo", input: {} }] },
        { type: "tool_calls", toolCalls: [{ id: "call-2", name: "echo", input: {} }] }
      ])
    );
    registry.registerTool(createTestTool({ name: "echo", content: "ok" }));

    const result = await new AgentLoop({ registry }).run({
      input: "loop",
      providerId: "mock",
      maxTurns: 2,
      runId: "run-5"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "MAX_TURNS_EXCEEDED" }
    });
  });

  it("returns only events from the current run", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([{ type: "final", content: "first" }, { type: "final", content: "second" }])
    );
    const loop = new AgentLoop({ registry });

    await loop.run({ input: "one", providerId: "mock", runId: "run-one" });
    const second = await loop.run({ input: "two", providerId: "mock", runId: "run-two" });

    expect(second.events.every((event) => event.runId === "run-two")).toBe(true);
  });

  it("blocks a tool call before execution and returns the denial as a model-visible observation", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    let executions = 0;
    hookKernel.registerHook("gate-plugin", 0, {
      id: "deny-secret",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler(context) {
        return context.call.name === "secret"
          ? { type: "deny", reason: "secret is blocked" }
          : { type: "allow" };
      }
    });
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-secret", name: "secret", input: {} }] },
        (request) => {
          const last = request.messages.at(-1);
          return {
            type: "final",
            content: last?.role === "tool" && last.isError ? last.content : "missing blocked observation"
          };
        }
      ])
    );
    registry.registerTool({
      name: "secret",
      description: "Secret tool",
      inputSchema: { type: "object" },
      effect: "read",
      execute() {
        executions += 1;
        return { ok: true, content: "should not happen" };
      }
    });

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "Use secret",
      providerId: "mock",
      runId: "run-gate-deny"
    });

    expect(executions).toBe(0);
    expect(result).toMatchObject({ ok: true, finalAnswer: "TOOL_CALL_BLOCKED: secret is blocked" });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.HookDecision);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.ToolResult,
        result: expect.objectContaining({ ok: false })
      })
    );
  });

  it("preserves existing successful tool execution when the gate allows", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    hookKernel.registerHook("gate-plugin", 0, {
      id: "allow-all",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        return { type: "allow" };
      }
    });
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-allowed", name: "echo", input: {} }] },
        { type: "final", content: "allowed final" }
      ])
    );
    registry.registerTool(createTestTool({ name: "echo", content: "allowed" }));

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "Use echo",
      providerId: "mock",
      runId: "run-gate-allow"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "allowed final" });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.ToolResult);
  });

  it("can allow one tool call and deny a later tool call in the same assistant message", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const executed: string[] = [];
    hookKernel.registerHook("gate-plugin", 0, {
      id: "deny-second",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler(context) {
        return context.call.name === "blocked"
          ? { type: "deny", reason: "second blocked" }
          : { type: "allow" };
      }
    });
    registry.registerProvider(
      createMockProvider([
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call-allowed", name: "allowed", input: {} },
            { id: "call-blocked", name: "blocked", input: {} }
          ]
        },
        (request) => ({
          type: "final",
          content: request.messages
            .filter((message) => message.role === "tool")
            .map((message) => message.content)
            .join(" | ")
        })
      ])
    );
    for (const name of ["allowed", "blocked"]) {
      registry.registerTool({
        name,
        description: name,
        inputSchema: { type: "object" },
        effect: "read",
        execute() {
          executed.push(name);
          return { ok: true, content: name };
        }
      });
    }

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "Use two tools",
      providerId: "mock",
      runId: "run-mixed-gates"
    });

    expect(executed).toEqual(["allowed"]);
    expect(result).toMatchObject({ ok: true, finalAnswer: "allowed | TOOL_CALL_BLOCKED: second blocked" });
  });

  it("returns structured run failure when a gate hook throws", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    hookKernel.registerHook("gate-plugin", 0, {
      id: "throwing-gate",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        throw new Error("gate failed");
      }
    });
    registry.registerProvider(
      createMockProvider([{ type: "tool_calls", toolCalls: [{ id: "call-1", name: "echo", input: {} }] }])
    );
    registry.registerTool(createTestTool({ name: "echo", content: "unused" }));

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "Use echo",
      providerId: "mock",
      runId: "run-gate-throws"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HOOK_FAILED", message: "gate failed" }
    });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.HookFailure);
  });

  it("checks for missing tools only after the gate allows the call", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    hookKernel.registerHook("gate-plugin", 0, {
      id: "allow-missing",
      phase: HookPhase.PreToolGate,
      effect: HookEffect.Gate,
      handler() {
        return { type: "allow" };
      }
    });
    registry.registerProvider(
      createMockProvider([{ type: "tool_calls", toolCalls: [{ id: "call-missing", name: "missing", input: {} }] }])
    );

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "Use missing",
      providerId: "mock",
      runId: "run-gate-missing"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_FOUND" }
    });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.HookDecision);
  });
});
