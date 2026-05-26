import { describe, expect, it } from "vitest";
import { createAgentRuntime } from "./create-agent-runtime";
import { createMockProvider } from "../testing/mock-provider";
import { createTestTool } from "../testing/test-tool";

describe("AgentRuntime", () => {
  it("lets a host register capabilities, run a turn, and observe events", async () => {
    const runtime = createAgentRuntime();
    const eventTypes: string[] = [];
    runtime.onEvent((event) => eventTypes.push(event.type));

    runtime.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "echo", input: { value: "hello" } }] },
        { type: "final", content: "final hello", usage: { totalTokens: 10 } }
      ])
    );
    runtime.registerTool(createTestTool({ name: "echo", content: "hello" }));

    const result = await runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "runtime-run-1"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "final hello" });
    expect(eventTypes).toContain("tool.result");
    expect(eventTypes).toContain("usage.recorded");
  });

  it("does not require real provider SDKs for runtime tests", async () => {
    const runtime = createAgentRuntime();
    runtime.registerProvider(createMockProvider([{ type: "final", content: "mocked" }]));

    const result = await runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "runtime-run-2"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "mocked" });
  });

  it("surfaces missing provider failures through the runtime facade", async () => {
    const runtime = createAgentRuntime();

    const result = await runtime.run({
      input: "hello",
      providerId: "missing",
      runId: "runtime-run-3"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_NOT_FOUND" }
    });
  });

  it("disposes runtime event listeners and history", async () => {
    const runtime = createAgentRuntime();
    const seen: string[] = [];
    runtime.onEvent((event) => seen.push(event.type));
    runtime.dispose();

    runtime.registerProvider(createMockProvider([{ type: "final", content: "done" }]));
    const result = await runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "runtime-run-4"
    });

    expect(result.ok).toBe(true);
    expect(seen).toEqual([]);
  });
});
