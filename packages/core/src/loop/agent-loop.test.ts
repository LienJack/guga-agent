import { describe, expect, it } from "vitest";
import { AgentLoop } from "./agent-loop";
import { EventBus } from "../events/event-bus";
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
      "run.started",
      "model.requested",
      "model.responded",
      "tool.called",
      "tool.result",
      "model.requested",
      "model.responded",
      "run.finished"
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
    expect(result.events.some((event) => event.type === "tool.result")).toBe(true);
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
    expect(result.events.map((event) => event.type)).toContain("error");
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
    expect(result.events.map((event) => event.type)).toContain("error");
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
});
