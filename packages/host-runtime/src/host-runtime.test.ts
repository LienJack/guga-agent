import { describe, expect, it } from "vitest";
import {
  ProviderErrorCategory,
  createAgentRuntime,
  createMockProvider,
  createTestTool,
  type DurableEventEnvelope,
  type EventAppendResult,
  type EventStore,
  type ToolDefinition
} from "@guga-agent/core";
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
    const session = await host.createSession({ title: "Test" });

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
    await expect(host.getSession(session.id)).resolves.toMatchObject({
      lastRunId: run.id,
      lastRunStatus: "completed",
      branches: [
        expect.objectContaining({
          id: "main",
          lastRunId: run.id,
          lastRunStatus: "completed"
        })
      ]
    });
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
    const session = await host.createSession();

    const run = await host.startRun({ sessionId: session.id, input: "use tool", providerId: "mock" });

    expect(host.listRunEvents(run.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool.started", callId: "call-1", name: "echo" }),
      expect.objectContaining({ type: "tool.completed", callId: "call-1", name: "echo", output: "tool output" })
    ]));
  });

  it("projects provider retry model events into host retry events", async () => {
    let attempts = 0;
    const runtime = createAgentRuntime({
      routerPolicy: {
        primary: { providerId: "retrying", modelId: "retry-model" },
        maxRetries: 1
      }
    });
    runtime.registerModel?.({ providerId: "retrying", modelId: "retry-model" });
    runtime.registerProvider({
      id: "retrying",
      async generate() {
        attempts += 1;
        if (attempts === 1) {
          return {
            type: "failure",
            error: {
              category: ProviderErrorCategory.Retryable,
              code: "RATE_LIMITED",
              message: "rate limited",
              retryable: true
            }
          };
        }
        return { type: "final", content: "recovered" };
      }
    });
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = await host.createSession();

    const run = await host.startRun({ sessionId: session.id, input: "retry" });

    expect(run.status).toBe("completed");
    expect(host.listRunEvents(run.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "retry.started", attempt: 1, reason: "rate limited" }),
      expect.objectContaining({ type: "retry.completed", attempt: 1 })
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
    const session = await host.createSession();

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
    const session = await host.createSession();
    const run = host.startRunDetached({ sessionId: session.id, input: "wait", providerId: "slow" });
    await waitFor(() => !!finishRun);

    const updatedRun = host.enqueueRunInput(run.id, { mode: "steer", text: "adjust course" });

    expect(updatedRun?.queuedInputs).toEqual([
      expect.objectContaining({
        id: "input-input-1",
        mode: "steer",
        status: "deferred",
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
            status: "deferred",
            textPreview: "adjust course"
          })
        ]
      })
    ]));

    finishRun?.("done");
    await waitForRunStatus(host, run.id, "completed");
  });

  it("consumes a queued follow-up into the next run after the active run finishes", async () => {
    let finishRun: ((content: string) => void) | undefined;
    const runtime = createAgentRuntime();
    runtime.registerProvider({
      id: "controlled",
      async generate(request) {
        if (!finishRun) {
          const content = await new Promise<string>((resolve) => {
            finishRun = resolve;
          });
          return { type: "final", content };
        }
        return {
          type: "final",
          content: `next:${String(request.messages.at(-1)?.content ?? "")}`
        };
      }
    });
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1", "input-1", "run-2"])
    });
    const session = await host.createSession();
    const run = host.startRunDetached({ sessionId: session.id, input: "wait", providerId: "controlled" });
    await waitFor(() => !!finishRun);

    host.enqueueRunInput(run.id, { mode: "follow_up", text: "next turn" });
    finishRun?.("done");

    await waitForRunStatus(host, run.id, "completed");
    await waitFor(async () => (await host.listSessions()).length === 1 && host.listAuditSummaries().length === 2);
    const runs = host.listAuditSummaries().map((summary) => summary.runId);
    expect(runs).toEqual(["run-run-1", "run-run-2"]);
    expect(host.getRun("run-run-1")?.queuedInputs).toEqual([]);
    await expect(waitForRunStatus(host, "run-run-2", "completed")).resolves.toMatchObject({
      input: "next turn",
      finalAnswer: "next:next turn"
    });
  });

  it("tracks generic interactions and emits run-scoped interaction events", async () => {
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
      idFactory: deterministicIds(["session-1", "run-1", "interaction-1"])
    });
    const session = await host.createSession();
    const run = host.startRunDetached({ sessionId: session.id, input: "wait", providerId: "slow" });
    await waitFor(() => !!finishRun);

    const interaction = host.requestInteraction({
      sessionId: session.id,
      runId: run.id,
      request: { kind: "confirm", message: "Continue?" }
    });
    const resolved = host.resolveInteraction(interaction?.id ?? "", true);

    expect(interaction).toMatchObject({
      id: "interaction-interaction-1",
      status: "pending",
      request: { kind: "confirm", message: "Continue?" }
    });
    expect(resolved).toMatchObject({ status: "resolved", response: true });
    expect(host.listRunEvents(run.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "interaction.requested", requestId: "interaction-interaction-1" }),
      expect.objectContaining({ type: "interaction.resolved", requestId: "interaction-interaction-1", response: true })
    ]));

    finishRun?.("done");
    await waitForRunStatus(host, run.id, "completed");
  });

  it("forks and resumes session branches", async () => {
    const host = new HostRuntime({
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "branch-1"])
    });
    const session = await host.createSession({ title: "Branches" });

    const forked = host.forkSession(session.id, { summary: "Try another path" });

    expect(forked).toMatchObject({
      activeBranchId: "branch-branch-1",
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "main" }),
        expect.objectContaining({ id: "branch-branch-1", parentBranchId: "main", summary: "Try another path" })
      ])
    });
    expect(host.getSessionTree(session.id)).toMatchObject({
      activeBranchId: "branch-branch-1",
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "main" }),
        expect.objectContaining({ id: "branch-branch-1" })
      ])
    });
    await expect(host.resumeSession(session.id, { branchId: "main" })).resolves.toMatchObject({ activeBranchId: "main" });
  });

  it("stores structured run failures", async () => {
    const runtime = createAgentRuntime();
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = await host.createSession();

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
    const session = await host.createSession();

    const pendingRun = host.startRun({ sessionId: session.id, input: "wait", providerId: "slow" });
    expect(host.cancelRun("run-run-1")).toMatchObject({ status: "cancelled" });

    await expect(pendingRun).resolves.toMatchObject({
      id: "run-run-1",
      status: "cancelled",
      error: { code: "RUN_CANCELLED" }
    });
    expect(host.listRunEvents("run-run-1").at(-1)).toMatchObject({ type: "run.cancelled" });
  });

  it("cancels pending queue, permissions, and interactions before run cancellation", async () => {
    const host = new HostRuntime({
      runtimeOptions: { permissions: { profile: "ask-on-write" } },
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1", "input-1", "interaction-1"])
    });
    host.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "write", name: "write_tool", input: { value: "x" } }] },
      { type: "final", content: "done" }
    ]));
    host.registerTool(writeTool());
    const session = await host.createSession();
    const runPromise = host.startRun({ sessionId: session.id, input: "write", providerId: "mock" });
    await waitFor(() => host.listRunEvents("run-run-1").some((event) => event.type === "permission.requested"));
    host.enqueueRunInput("run-run-1", { mode: "follow_up", text: "later" });
    const interaction = host.requestInteraction({
      sessionId: session.id,
      runId: "run-run-1",
      request: { kind: "confirm", message: "Continue?" }
    });

    host.cancelRun("run-run-1");
    await expect(runPromise).resolves.toMatchObject({ status: "cancelled" });

    const permissionId = "run-run-1:write:1";
    expect(host.getPermission(permissionId)).toMatchObject({ status: "cancelled" });
    expect(host.getInteraction(interaction?.id ?? "")).toMatchObject({ status: "cancelled" });
    expect(host.getRun("run-run-1")?.queuedInputs).toEqual([]);
    const eventTypes = host.listRunEvents("run-run-1").map((event) => event.type);
    expect(eventTypes.indexOf("queue.updated")).toBeLessThan(eventTypes.indexOf("run.cancelled"));
    expect(eventTypes.indexOf("permission.cancelled")).toBeLessThan(eventTypes.indexOf("run.cancelled"));
    expect(eventTypes.indexOf("interaction.cancelled")).toBeLessThan(eventTypes.indexOf("run.cancelled"));
  });

  it("responds to pending permission resources and rejects invalid or duplicate responses", async () => {
    const host = new HostRuntime({
      runtimeOptions: { permissions: { profile: "ask-on-write" } },
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    host.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "write", name: "write_tool", input: { value: "x" } }] },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.role === "tool" ? request.messages.at(-1)!.content : "missing"
      })
    ]));
    host.registerTool(writeTool());
    const session = await host.createSession();
    const runPromise = host.startRun({ sessionId: session.id, input: "write", providerId: "mock" });
    const permissionId = "run-run-1:write:1";
    await waitFor(() => host.getPermission(permissionId)?.status === "pending");

    expect(host.respondPermission(permissionId, { decision: "maybe" as "allow" })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "BAD_REQUEST" }
    });
    expect(host.respondPermission(permissionId, { decision: "allow", remember: "once" })).toMatchObject({
      ok: true,
      permission: { status: "allowed" }
    });
    expect(host.respondPermission(permissionId, { decision: "deny" })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "PERMISSION_NOT_PENDING" }
    });
    await expect(runPromise).resolves.toMatchObject({
      status: "completed",
      finalAnswer: "write ok"
    });
  });

  it("hands profile-marked host permission requests to the host bridge", async () => {
    const host = new HostRuntime({
      runtimeOptions: {
        permissions: {
          profile: "ask-on-write",
          resolver: () => ({
            action: "deny",
            remember: "once",
            source: "profile",
            reason: "host prompt required",
            metadata: { hostResolverRequired: true }
          })
        }
      },
      now: () => new Date("2026-05-27T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    host.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "write", name: "write_tool", input: { value: "x" } }] },
      { type: "final", content: "allowed" }
    ]));
    host.registerTool(writeTool());
    const session = await host.createSession();
    const runPromise = host.startRun({ sessionId: session.id, input: "write", providerId: "mock" });
    const permissionId = "run-run-1:write:1";

    await waitFor(() => host.getPermission(permissionId)?.status === "pending");
    expect(host.respondPermission(permissionId, { decision: "allow" })).toMatchObject({
      ok: true,
      permission: { status: "allowed" }
    });

    await expect(runPromise).resolves.toMatchObject({
      status: "completed",
      finalAnswer: "allowed"
    });
  });

  it("stores typed code task and verification events as resources", async () => {
    const runtime = createAgentRuntime();
    runtime.registerProvider(createMockProvider([{ type: "final", content: "ready" }]));
    const host = new HostRuntime({
      runtime,
      now: () => new Date("2026-05-29T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1"])
    });
    const session = await host.createSession();
    const run = await host.startRun({ sessionId: session.id, input: "implement", providerId: "mock" });

    host.recordHostEvent(run.id, {
      type: "task.created",
      sessionId: session.id,
      taskId: "task-1",
      rootRunId: run.id,
      cwd: "/repo",
      objective: "implement feature",
      state: "created",
      plan: {
        summary: "implement feature",
        files: [],
        checks: [],
        assumptions: [],
        risks: [],
        ledgerItems: [{
          id: "item-1",
          title: "implement feature",
          status: "pending",
          evidence: [],
          changedFiles: [],
          verificationAttemptIds: [],
          risks: []
        }]
      }
    });
    host.recordHostEvent(run.id, {
      type: "task.phase_changed",
      sessionId: session.id,
      taskId: "task-1",
      from: "executing",
      to: "verifying",
      activeRunId: run.id,
      attempt: 1
    });
    host.recordHostEvent(run.id, {
      type: "verification.completed",
      sessionId: session.id,
      taskId: "task-1",
      runId: run.id,
      attempt: {
        id: "verify-1",
        taskId: "task-1",
        sessionId: session.id,
        runId: run.id,
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "passed",
        reason: "focused unit test",
        exitCode: 0,
        outputSummary: "ok"
      }
    });
    host.recordHostEvent(run.id, {
      type: "task.completed",
      sessionId: session.id,
      taskId: "task-1",
      evidence: {
        completedAt: "2026-05-29T00:00:00.000Z",
        passingVerificationAttemptIds: ["verify-1"]
      }
    });

    expect(host.getTask("task-1")).toMatchObject({
      id: "task-1",
      state: "completed",
      phase: "completed",
      ledgerSummary: { total: 1, pending: 1, currentItemId: "item-1" },
      verificationAttempts: [expect.objectContaining({ id: "verify-1", status: "passed" })],
      completionEvidence: { passingVerificationAttemptIds: ["verify-1"] }
    });
    expect(host.listSessionTasks(session.id).map((task) => task.id)).toEqual(["task-1"]);
    expect(host.listRunEvents(run.id).map((event) => event.type)).toEqual(expect.arrayContaining([
      "task.created",
      "task.phase_changed",
      "verification.completed",
      "task.completed"
    ]));
  });

  it("starts a configured code task loop for natural coding prompts", async () => {
    const runtime = createAgentRuntime();
    runtime.registerProvider({
      id: "unused",
      async generate() {
        throw new Error("plain runtime path should not run");
      }
    });
    const host = new HostRuntime({
      runtime,
      profileId: "code",
      cwd: "/repo",
      codeTasks: {
        classify: () => ({
          shouldCreateTask: true,
          confidence: "high",
          reason: "test coding task"
        }),
        async start(options) {
          options.emit({
            type: "task.created",
            sessionId: options.sessionId,
            taskId: options.taskId,
            rootRunId: options.rootRunId,
            cwd: options.cwd,
            objective: options.objective,
            state: "created"
          });
          options.emit({
            type: "verification.completed",
            sessionId: options.sessionId,
            taskId: options.taskId,
            runId: options.rootRunId,
            attempt: {
              id: "verify-1",
              taskId: options.taskId,
              sessionId: options.sessionId,
              runId: options.rootRunId,
              command: "pnpm test",
              cwd: options.cwd,
              required: true,
              status: "passed",
              reason: "focused test"
            }
          });
          options.emit({
            type: "task.completed",
            sessionId: options.sessionId,
            taskId: options.taskId,
            evidence: {
              completedAt: "2026-05-29T00:00:00.000Z",
              passingVerificationAttemptIds: ["verify-1"]
            }
          });
          return { finalAnswer: "task done" };
        }
      },
      now: () => new Date("2026-05-29T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1", "task-1"])
    });
    const session = await host.createSession();

    const run = await host.startRun({ sessionId: session.id, input: "implement feature", providerId: "unused" });

    expect(run).toMatchObject({
      status: "completed",
      finalAnswer: "task done"
    });
    expect(host.listRunEvents(run.id).map((event) => event.type)).toEqual([
      "run.started",
      "task.created",
      "verification.completed",
      "task.completed",
      "run.completed"
    ]);
    expect(host.listSessionTasks(session.id)).toEqual([
      expect.objectContaining({ id: "task-task-1", state: "completed" })
    ]);
  });

  it("persists code task host facts to the durable event store", async () => {
    const eventStore = new FakeEventStore();
    const runtime = createAgentRuntime({ stores: { events: eventStore } });
    runtime.registerProvider({
      id: "unused",
      async generate() {
        throw new Error("plain runtime path should not run");
      }
    });
    const host = new HostRuntime({
      runtime,
      profileId: "code",
      cwd: "/repo",
      codeTasks: {
        classify: () => ({
          shouldCreateTask: true,
          confidence: "high",
          reason: "test coding task"
        }),
        async start(options) {
          options.emit({
            type: "task.created",
            sessionId: options.sessionId,
            taskId: options.taskId,
            rootRunId: options.rootRunId,
            cwd: options.cwd,
            objective: options.objective,
            state: "created"
          });
          options.emit({
            type: "verification.completed",
            sessionId: options.sessionId,
            taskId: options.taskId,
            runId: options.rootRunId,
            attempt: {
              id: "verify-1",
              taskId: options.taskId,
              sessionId: options.sessionId,
              runId: options.rootRunId,
              command: "pnpm test",
              cwd: options.cwd,
              required: true,
              status: "passed",
              reason: "focused test"
            }
          });
          return { finalAnswer: "task done" };
        }
      },
      now: () => new Date("2026-05-29T00:00:00.000Z"),
      idFactory: deterministicIds(["session-1", "run-1", "task-1"])
    });
    const session = await host.createSession();

    await host.startRun({ sessionId: session.id, input: "implement feature", providerId: "unused" });

    expect(eventStore.events.map((event) => event.eventType)).toEqual([
      "host.task.created",
      "host.verification.completed"
    ]);
    expect(host.getTask("task-task-1")).toMatchObject({
      durability: { status: "durable", latestEventId: "host-event-session-session-1-run-run-1-3" }
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

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for condition");
}

function writeTool(): ToolDefinition {
  return {
    name: "write_tool",
    description: "Write test tool",
    inputSchema: { type: "object" },
    effect: "write",
    execute() {
      return { ok: true, content: "write ok" };
    }
  };
}

class FakeEventStore implements EventStore {
  readonly events: DurableEventEnvelope[] = [];

  append(event: DurableEventEnvelope): EventAppendResult {
    this.events.push(event);
    return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
  }

  readStream() {
    return { ok: true as const, events: this.events, nextRevision: this.events.length };
  }
}
