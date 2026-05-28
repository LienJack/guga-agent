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

  it("starts detached runs so callers can observe events while execution is active", async () => {
    let finishRun: ((content: string) => void) | undefined;
    const runtime = createAgentRuntime();
    runtime.registerProvider({
      id: "slow",
      async generate() {
        const content = await new Promise<string>((resolve) => {
          finishRun = resolve;
        });
        return {
          type: "final",
          content,
          usage: { totalTokens: 5 }
        };
      }
    });
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = host.createSession();

    const run = host.startRunDetached({ sessionId: session.id, input: "wait", providerId: "slow" });

    expect(run).toMatchObject({ id: "run-run-1", status: "running" });
    expect(host.getRun(run.id)).toMatchObject({ status: "running" });

    await waitFor(() => !!finishRun);
    finishRun?.("detached done");
    await expect(waitForRunStatus(host, run.id, "completed")).resolves.toMatchObject({
      status: "completed",
      finalAnswer: "detached done"
    });
    expect(host.listRunEvents(run.id).map((event) => event.type)).toEqual([
      "run.started",
      "message.delta",
      "message.completed",
      "usage.recorded",
      "run.completed"
    ]);
  });

  it("queues run input and emits queue updates while a run is active", async () => {
    let finishRun: ((content: string) => void) | undefined;
    const runtime = createAgentRuntime();
    runtime.registerProvider({
      id: "slow",
      async generate() {
        const content = await new Promise<string>((resolve) => {
          finishRun = resolve;
        });
        return { type: "final", content };
      }
    });
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1", "input-1"])
    });
    const session = host.createSession();
    const run = host.startRunDetached({ sessionId: session.id, input: "wait", providerId: "slow" });
    await waitFor(() => !!finishRun);

    const updatedRun = host.enqueueRunInput(run.id, { mode: "steer", text: "adjust course" });

    expect(updatedRun?.queuedInputs).toEqual([
      expect.objectContaining({
        id: "input-input-1",
        mode: "steer",
        text: "adjust course",
        textPreview: "adjust course"
      })
    ]);
    expect(host.listRunEvents(run.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "queue.updated",
        pending: [
          expect.objectContaining({
            id: "input-input-1",
            mode: "steer",
            textPreview: "adjust course"
          })
        ]
      })
    ]));

    finishRun?.("done");
    await waitForRunStatus(host, run.id, "completed");
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

  it("cancels an active run through the host controller", async () => {
    const runtime = createAgentRuntime();
    runtime.registerProvider({
      id: "slow",
      async generate(request) {
        await new Promise<void>((resolve) => {
          if (request.signal?.aborted) {
            resolve();
            return;
          }
          request.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        return {
          type: "failure",
          error: { code: "ABORTED", message: "aborted" }
        };
      }
    });
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = host.createSession();

    const pendingRun = host.startRun({ sessionId: session.id, input: "wait", providerId: "slow" });
    expect(host.cancelRun("run-run-1")).toMatchObject({ status: "cancelled" });

    await expect(pendingRun).resolves.toMatchObject({
      id: "run-run-1",
      status: "cancelled",
      error: { code: "RUN_CANCELLED" }
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

async function waitForRunStatus(
  host: HostRuntime,
  runId: string,
  status: "completed" | "failed" | "cancelled"
): Promise<ReturnType<HostRuntime["getRun"]>> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const run = host.getRun(runId);
    if (run?.status === status) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Timed out waiting for run ${runId} to reach ${status}`);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for condition");
}
