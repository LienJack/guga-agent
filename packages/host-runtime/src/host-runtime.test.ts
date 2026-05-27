import { describe, expect, it } from "vitest";
import { createAgentRuntime, createMockProvider, createTestTool } from "@guga-agent/core";
import { HostRuntime } from "./host-runtime";

describe("HostRuntime", () => {
  it("creates sessions, runs the core runtime, and stores host events", async () => {
    const runtime = createAgentRuntime();
    runtime.registerProvider(createMockProvider([
      { type: "final", content: "hello from runtime", usage: { totalTokens: 7 } }
    ]));
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = host.createSession({ title: "Test" });

    const run = await host.startRun({
      sessionId: session.id,
      input: "hello",
      providerId: "mock"
    });

    expect(run).toMatchObject({
      id: "run-run-1",
      sessionId: "session-session-1",
      status: "completed",
      finalAnswer: "hello from runtime"
    });
    expect(host.listRunEvents(run.id).map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "message.completed",
      "usage.recorded",
      "run.completed"
    ]);
  });

  it("projects tool lifecycle events", async () => {
    const runtime = createAgentRuntime();
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "call-1", name: "echo", input: { value: "hello" } }] },
      { type: "final", content: "done" }
    ]));
    runtime.registerTool(createTestTool({ name: "echo", content: "tool output" }));
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = host.createSession();

    const run = await host.startRun({ sessionId: session.id, input: "use tool", providerId: "mock" });

    expect(host.listRunEvents(run.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool.started", callId: "call-1", name: "echo" }),
      expect.objectContaining({ type: "tool.completed", callId: "call-1", name: "echo", output: "tool output" })
    ]));
  });

  it("stores structured run failures", async () => {
    const runtime = createAgentRuntime();
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = host.createSession();

    const run = await host.startRun({ sessionId: session.id, input: "missing provider", providerId: "missing" });

    expect(run).toMatchObject({
      status: "failed",
      error: { code: "PROVIDER_NOT_FOUND" }
    });
    expect(host.listRunEvents(run.id).at(-1)).toMatchObject({
      type: "run.failed",
      error: { code: "PROVIDER_NOT_FOUND" }
    });
  });

  it("lists capability descriptors as host resources", () => {
    const runtime = createAgentRuntime();
    runtime.registerTool(createTestTool({ name: "echo", content: "ok" }));
    const host = new HostRuntime({ runtime });

    expect(host.listCapabilities()).toContainEqual({
      type: "tool",
      name: "echo",
      source: "host",
      status: "registered"
    });
  });
});

function deterministicIds(values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (!value) {
      throw new Error("No deterministic id left");
    }
    return value;
  };
}
