import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import { HookEffect, HookPhase } from "../contracts/hooks";
import { ModelEventType } from "../contracts/model-events";
import type { ArtifactStore, DurableEventEnvelope, EventStore, ReplayCapability, SessionStore } from "../contracts/persistence";
import { ProviderErrorCategory } from "../contracts/provider";
import { createDurableEventEnvelope } from "../persistence/durable-event-envelope";
import { createAgentRuntime } from "./create-agent-runtime";
import { createExamplePlugin } from "../testing/example-plugin";
import { createMockProvider } from "../testing/mock-provider";
import { createTestTool } from "../testing/test-tool";

const eventStore: EventStore = {
  append() {
    return { ok: false, status: "unavailable", reason: "test" };
  },
  readStream() {
    return { ok: true, events: [], nextRevision: 0 };
  }
};

const sessionStore: SessionStore = {
  createSession() {
    return { ok: false, diagnostic: { status: "unavailable", message: "test" } };
  },
  getSessionTree(sessionId) {
    return {
      ok: true,
      session: {
        id: sessionId,
        createdAt: "2026-05-27T00:00:00.000Z",
        updatedAt: "2026-05-27T00:00:00.000Z",
        activeBranchId: "main",
        rootBranchId: "main"
      },
      branches: [{
        id: "main",
        sessionId,
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "root" },
        visibleEventIds: []
      }],
      activeLeaf: {
        sessionId,
        branchId: "main",
        eventId: null,
        updatedAt: "2026-05-27T00:00:00.000Z",
        reason: "resume-selected"
      }
    };
  },
  forkBranch(options) {
    return {
      ok: true,
      branch: {
        id: options.branchId,
        sessionId: options.sessionId,
        parentBranchId: options.fromBranchId,
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: {
          type: "event",
          branchId: options.fromBranchId,
          eventId: options.fromEventId
        },
        visibleEventIds: [options.fromEventId]
      }
    };
  },
  setActiveLeaf(options) {
    return {
      ok: true,
      leaf: {
        sessionId: options.sessionId,
        branchId: options.branchId,
        eventId: options.eventId,
        updatedAt: "2026-05-27T00:00:00.000Z",
        reason: options.reason
      }
    };
  }
};

const artifactStore: ArtifactStore = {
  putArtifact() {
    return { ok: false, status: "unavailable", reason: "test" };
  },
  readArtifact() {
    return {
      ok: false,
      status: "unavailable",
      diagnostic: { kind: "unknown", message: "test", recoverable: true }
    };
  },
  tombstoneArtifact() {
    return {
      ok: false,
      status: "unavailable",
      diagnostic: { kind: "unknown", message: "test", recoverable: true }
    };
  }
};

const replayCapability: ReplayCapability = {
  replayConversation() {
    return { ok: true, messages: [{ role: "user", content: "recorded" }], diagnostics: [] };
  },
  replayModelInput() {
    return { ok: true, projection: undefined, diagnostics: [] };
  },
  replayAudit() {
    return { ok: true, timeline: [], diagnostics: [] };
  }
};

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
    runtime.registerModel({
      providerId: "mock",
      modelId: "mock-primary",
      purposes: ["primary"],
      capabilities: { toolCalling: true, usage: "optional" }
    });

    const result = await runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "runtime-run-1"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "final hello" });
    expect(eventTypes).toContain(AgentEventType.ToolResult);
    expect(eventTypes).toContain(AgentEventType.UsageRecorded);
    expect(runtime.listModels()).toEqual([
      expect.objectContaining({ providerId: "mock", modelId: "mock-primary" })
    ]);
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

  it("keeps plain runtimes usable while persistence and replay are explicitly unavailable", async () => {
    const runtime = createAgentRuntime();
    runtime.registerProvider(createMockProvider([{ type: "final", content: "mocked" }]));

    await expect(runtime.resumeSession({ sessionId: "missing-session" })).resolves.toMatchObject({
      ok: false,
      status: "unavailable"
    });
    await expect(
      runtime.forkSession({
        sessionId: "missing-session",
        branchId: "branch-2",
        fromBranchId: "main",
        fromEventId: "event-1"
      })
    ).resolves.toMatchObject({
      ok: false,
      diagnostic: { status: "unavailable" }
    });
    await expect(runtime.replayConversation({ sessionId: "missing-session" })).resolves.toMatchObject({
      ok: false,
      status: "unavailable"
    });

    const result = await runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "runtime-without-store"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "mocked" });
  });

  it("resumes sessions through configured event and session stores", async () => {
    const events = [
      durableRuntimeEvent({ type: AgentEventType.RunStarted, runId: "run-resume", input: "hello" }, "event-1"),
      durableRuntimeEvent({
        type: AgentEventType.ModelResponded,
        runId: "run-resume",
        turn: 0,
        response: { type: "final", content: "resumed answer" }
      }, "event-2")
    ];
    const runtime = createAgentRuntime({
      stores: {
        events: eventStoreWith(events),
        sessions: sessionStoreWithVisibleEvents(events.map((event) => event.eventId))
      }
    });

    await expect(runtime.resumeSession({ sessionId: "session-1" })).resolves.toMatchObject({
      ok: true,
      conversation: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "resumed answer" }
      ],
      interrupted: [expect.objectContaining({ kind: "run", status: "interrupted" })]
    });
  });

  it("forks sessions through append-only branch and leaf services", async () => {
    const events = [
      durableRuntimeEvent({ type: AgentEventType.RunStarted, runId: "run-fork", input: "hello" }, "event-1")
    ];
    const sessions = sessionStoreWithVisibleEvents(["event-1"]);
    const runtime = createAgentRuntime({
      stores: { events: eventStoreWith(events), sessions }
    });

    await expect(
      runtime.forkSession({
        sessionId: "session-1",
        branchId: "branch-fork",
        fromBranchId: "main",
        fromEventId: "event-1"
      })
    ).resolves.toMatchObject({
      ok: true,
      branch: { id: "branch-fork", parentBranchId: "main", visibleEventIds: ["event-1"] }
    });
    expect(await sessions.getSessionTree("session-1")).toMatchObject({
      ok: true,
      activeLeaf: { branchId: "branch-fork", eventId: "event-1", reason: "fork-created" }
    });
  });

  it("uses the forked branch as the active durable session for subsequent runs", async () => {
    const events = [
      durableRuntimeEvent({ type: AgentEventType.RunStarted, runId: "run-fork", input: "hello" }, "event-1")
    ];
    const sessions = sessionStoreWithVisibleEvents(["event-1"]);
    const runtime = createAgentRuntime({
      stores: { events: eventStoreWith(events), sessions }
    });
    const observed: string[] = [];
    runtime.onEvent((event) => observed.push(event.type));
    runtime.registerProvider(createMockProvider([{ type: "final", content: "branch answer" }]));

    await expect(
      runtime.forkSession({
        sessionId: "session-1",
        branchId: "branch-fork",
        fromBranchId: "main",
        fromEventId: "event-1"
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(runtime.run({ input: "after fork", providerId: "mock", runId: "run-after-fork" })).resolves.toMatchObject({
      ok: true,
      finalAnswer: "branch answer"
    });

    expect(observed).toEqual(expect.arrayContaining([
      AgentEventType.SessionForked,
      AgentEventType.SessionLeafMoved
    ]));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        branchId: "branch-fork",
        payload: expect.objectContaining({ type: AgentEventType.ModelRequested, runId: "run-after-fork" })
      })
    ]));
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

  it("requires providerId only when no provider router is configured", async () => {
    const runtime = createAgentRuntime();

    const result = await runtime.run({
      input: "hello",
      runId: "runtime-missing-provider-id"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PROVIDER_NOT_FOUND",
        message: "Provider id is required when no provider router is configured"
      }
    });
  });

  it("lets hosts mount plugins before the first run and observe lazy initialization", async () => {
    const runtime = createAgentRuntime({
      plugins: [
        {
          id: "runtime-plugin",
          init(context) {
            context.registerProvider(createMockProvider([{ type: "final", content: "plugin final" }], { id: "plugin-provider" }));
            context.registerModel({
              providerId: "plugin-provider",
              modelId: "plugin-primary",
              purposes: ["primary"],
              capabilities: { usage: "optional" }
            });
          }
        }
      ]
    });
    const eventTypes: string[] = [];
    runtime.onEvent((event) => eventTypes.push(event.type));

    const result = await runtime.run({
      input: "hello",
      providerId: "plugin-provider",
      runId: "runtime-plugin-run"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "plugin final" });
    expect(eventTypes).toContain(AgentEventType.PluginCapabilityRegistered);
    expect(eventTypes).toContain(AgentEventType.PluginInitialized);
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.PluginInitialized);
    expect(runtime.listModels()).toEqual([
      expect.objectContaining({ providerId: "plugin-provider", modelId: "plugin-primary" })
    ]);
  });

  it("resolves plugin-registered persistence capabilities after lazy initialization", async () => {
    const runtime = createAgentRuntime({
      plugins: [
        {
          id: "runtime-persistence-plugin",
          init(context) {
            context.registerProvider(createMockProvider([{ type: "final", content: "plugin final" }], { id: "plugin-provider" }));
            context.registerEventStore(eventStore);
            context.registerSessionStore(sessionStore);
            context.registerArtifactStore(artifactStore);
            context.registerReplayCapability(replayCapability);
          }
        }
      ]
    });

    expect(runtime.getPersistenceCapabilities()).toEqual({
      eventStore: undefined,
      sessionStore: undefined,
      artifactStore: undefined,
      replay: undefined
    });

    await runtime.run({
      input: "hello",
      providerId: "plugin-provider",
      runId: "runtime-persistence-plugin-run"
    });

    expect(runtime.getPersistenceCapabilities()).toEqual({
      eventStore,
      sessionStore,
      artifactStore,
      replay: replayCapability
    });
    await expect(runtime.resumeSession({ sessionId: "session-plugin" })).resolves.toMatchObject({
      ok: true,
      session: { id: "session-plugin" }
    });
    await expect(runtime.replayConversation({ sessionId: "session-plugin" })).resolves.toMatchObject({
      ok: true,
      messages: [{ role: "user", content: "recorded" }]
    });
  });

  it("prefers directly configured persistence capabilities over plugin registrations", async () => {
    const pluginEventStore: EventStore = { ...eventStore };
    const pluginSessionStore: SessionStore = { ...sessionStore };
    const pluginArtifactStore: ArtifactStore = { ...artifactStore };
    const pluginReplay: ReplayCapability = { ...replayCapability };
    const runtime = createAgentRuntime({
      stores: {
        events: eventStore,
        sessions: sessionStore,
        artifacts: artifactStore
      },
      replay: replayCapability,
      plugins: [
        {
          id: "lower-priority-persistence-plugin",
          init(context) {
            context.registerProvider(createMockProvider([{ type: "final", content: "plugin final" }], { id: "plugin-provider" }));
            context.registerEventStore(pluginEventStore);
            context.registerSessionStore(pluginSessionStore);
            context.registerArtifactStore(pluginArtifactStore);
            context.registerReplayCapability(pluginReplay);
          }
        }
      ]
    });

    await runtime.run({
      input: "hello",
      providerId: "plugin-provider",
      runId: "runtime-direct-persistence-run"
    });

    expect(runtime.getPersistenceCapabilities()).toEqual({
      eventStore,
      sessionStore,
      artifactStore,
      replay: replayCapability
    });
  });

  it("exposes directly configured stores to plugins during initialization", async () => {
    let observedEventStore: EventStore | undefined;
    let observedSessionStore: SessionStore | undefined;
    let observedArtifactStore: ArtifactStore | undefined;
    const runtime = createAgentRuntime({
      stores: {
        events: eventStore,
        sessions: sessionStore,
        artifacts: artifactStore
      },
      plugins: [
        {
          id: "store-observer",
          init(context) {
            context.registerProvider(createMockProvider([{ type: "final", content: "plugin final" }], { id: "plugin-provider" }));
            observedEventStore = context.getEventStore?.();
            observedSessionStore = context.getSessionStore?.();
            observedArtifactStore = context.getArtifactStore?.();
          }
        }
      ]
    });

    await runtime.run({
      input: "hello",
      providerId: "plugin-provider",
      runId: "runtime-direct-store-observer"
    });

    expect(observedEventStore).toBe(eventStore);
    expect(observedSessionStore).toBe(sessionStore);
    expect(observedArtifactStore).toBe(artifactStore);
  });

  it("surfaces plugin initialization failures as structured run failures", async () => {
    const runtime = createAgentRuntime({
      plugins: [
        {
          id: "bad-plugin",
          init() {
            throw new Error("plugin broke");
          }
        }
      ]
    });

    const result = await runtime.run({
      input: "hello",
      providerId: "missing",
      runId: "runtime-plugin-failure"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PLUGIN_INIT_FAILED", message: "plugin broke" }
    });
    expect(result.events.map((event) => event.type)).toEqual([
      AgentEventType.PluginFailure,
      AgentEventType.Error,
      AgentEventType.RunFinished
    ]);
  });

  it("disposes plugin state, returns shutdown failures, and prevents further runs", async () => {
    const runtime = createAgentRuntime();
    const seen: string[] = [];
    runtime.onEvent((event) => seen.push(event.type));
    runtime.registerProvider(createMockProvider([{ type: "final", content: "done" }]));

    const beforeDispose = await runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "runtime-before-dispose"
    });

    expect(beforeDispose.ok).toBe(true);
    const shutdown = await runtime.dispose();

    expect(shutdown).toMatchObject({ ok: true, failures: [] });
    expect(seen).toContain(AgentEventType.RunStarted);

    const result = await runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "runtime-run-4"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" }
    });
  });

  it("runs shutdown lifecycle hooks and plugin shutdown during dispose", async () => {
    const order: string[] = [];
    const runtime = createAgentRuntime({
      plugins: [
        {
          id: "shutdown-plugin",
          init(context) {
            context.registerProvider(createMockProvider([{ type: "final", content: "ok" }], { id: "shutdown-provider" }));
            context.registerHook({
              id: "shutdown-hook",
              phase: HookPhase.RuntimeShutdown,
              effect: HookEffect.Observe,
              handler() {
                order.push("hook");
              }
            });
          },
          shutdown() {
            order.push("plugin");
          }
        }
      ]
    });

    await runtime.run({
      input: "hello",
      providerId: "shutdown-provider",
      runId: "runtime-shutdown-run"
    });

    const shutdown = await runtime.dispose();

    expect(order).toEqual(["hook", "plugin"]);
    expect(shutdown.ok).toBe(true);
    expect(shutdown.events.map((event) => event.type)).toContain(AgentEventType.PluginShutdown);
  });

  it("returns shutdown failure details before clearing event listeners", async () => {
    const runtime = createAgentRuntime({
      plugins: [
        {
          id: "bad-shutdown",
          init() {},
          shutdown() {
            throw new Error("shutdown broke");
          }
        }
      ]
    });

    await runtime.run({
      input: "hello",
      providerId: "missing",
      runId: "runtime-init-only"
    });

    const shutdown = await runtime.dispose();

    expect(shutdown.ok).toBe(false);
    expect(shutdown.failures).toEqual([
      expect.objectContaining({ code: "PLUGIN_SHUTDOWN_FAILED", message: "shutdown broke" })
    ]);
    expect(shutdown.events.map((event) => event.type)).toContain(AgentEventType.PluginFailure);
  });

  it("runs end-to-end with the comprehensive example plugin provider and tool", async () => {
    const example = createExamplePlugin();
    const runtime = createAgentRuntime({ plugins: [example.plugin] });

    const result = await runtime.run({
      input: "Use the example plugin",
      providerId: example.providerId,
      runId: "runtime-example-plugin"
    });

    expect(result).toMatchObject({
      ok: true,
      finalAnswer: "example final: example tool result"
    });
    expect(example.state.toolExecutions).toBe(1);
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.PluginCapabilityRegistered);
  });

  it("lets the comprehensive example plugin block a tool call through pre-tool gate", async () => {
    const example = createExamplePlugin({ gate: "deny" });
    const runtime = createAgentRuntime({ plugins: [example.plugin] });

    const result = await runtime.run({
      input: "Use the example plugin",
      providerId: example.providerId,
      runId: "runtime-example-plugin-deny"
    });

    expect(result).toMatchObject({
      ok: true,
      finalAnswer: "example final: TOOL_CALL_BLOCKED: blocked by example plugin"
    });
    expect(example.state.toolExecutions).toBe(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.HookDecision,
        decision: expect.objectContaining({ type: "deny" })
      })
    );
  });

  it("cleans up comprehensive example plugin lifecycle state on dispose", async () => {
    const example = createExamplePlugin();
    const runtime = createAgentRuntime({ plugins: [example.plugin] });

    await runtime.run({
      input: "Use the example plugin",
      providerId: example.providerId,
      runId: "runtime-example-plugin-shutdown"
    });

    const shutdown = await runtime.dispose();

    expect(shutdown.ok).toBe(true);
    expect(example.state.active).toBe(false);
    expect(example.state.shutdowns).toBe(1);
  });

  it("does not auto-load the comprehensive example plugin for plain runtimes", async () => {
    const runtime = createAgentRuntime();

    const result = await runtime.run({
      input: "Use the example plugin",
      providerId: "example-provider",
      runId: "runtime-no-example-plugin"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_NOT_FOUND" }
    });
  });

  it("can use the comprehensive example plugin to verify hook failures are observable", async () => {
    const example = createExamplePlugin({ failHook: new Error("example hook broke") });
    const runtime = createAgentRuntime({ plugins: [example.plugin] });

    const result = await runtime.run({
      input: "Use the example plugin",
      providerId: example.providerId,
      runId: "runtime-example-plugin-hook-failure"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "HOOK_FAILED", message: "example hook broke" }
    });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.HookFailure);
  });

  it("routes through provider policy, falls back after rate-limit, and records model events", async () => {
    const runtime = createAgentRuntime({
      routerPolicy: {
        primary: { providerId: "primary-provider", modelId: "primary-model" },
        purposes: [
          {
            purpose: "primary",
            candidates: [
              { providerId: "primary-provider", modelId: "primary-model" },
              { providerId: "fallback-provider", modelId: "fallback-model" }
            ]
          }
        ]
      }
    });
    runtime.registerProvider(
      createMockProvider(
        [
          {
            type: "failure",
            error: {
              category: ProviderErrorCategory.RateLimit,
              code: "RATE_LIMITED",
              message: "rate limited",
              retryable: false
            },
            usage: { inputTokens: 1, cost: { status: "unknown" } }
          }
        ],
        { id: "primary-provider" }
      )
    );
    runtime.registerProvider(
      createMockProvider(
        [{ type: "final", content: "fallback final", usage: { totalTokens: 5, cost: { status: "unknown" } } }],
        { id: "fallback-provider" }
      )
    );
    runtime.registerModel({ providerId: "primary-provider", modelId: "primary-model", purposes: ["primary"] });
    runtime.registerModel({ providerId: "fallback-provider", modelId: "fallback-model", purposes: ["primary"] });

    const result = await runtime.run({
      input: "hello",
      providerId: "primary-provider",
      purpose: "primary",
      runId: "runtime-router-fallback"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "fallback final" });
    const modelEvents = result.events
      .filter((event) => event.type === AgentEventType.ModelEvent)
      .map((event) => event.event.type);
    expect(modelEvents).toContain(ModelEventType.ProviderError);
    expect(modelEvents).toContain(ModelEventType.FallbackSelected);
    expect(modelEvents).toContain(ModelEventType.Usage);
  });

  it("routes model tool intent through the Guga tool pipeline after pre-tool gate", async () => {
    const runtime = createAgentRuntime({
      routerPolicy: {
        primary: { providerId: "tool-provider", modelId: "tool-model" }
      }
    });
    runtime.registerProvider(
      createMockProvider(
        [
          { type: "tool_calls", toolCalls: [{ id: "call-router", name: "echo", input: { value: "hello" } }] },
          { type: "final", content: "tool complete" }
        ],
        { id: "tool-provider" }
      )
    );
    runtime.registerModel({
      providerId: "tool-provider",
      modelId: "tool-model",
      purposes: ["primary"],
      capabilities: { toolCalling: true }
    });
    runtime.registerTool(createTestTool({ name: "echo", content: "hello" }));

    const result = await runtime.run({
      input: "use a tool",
      providerId: "tool-provider",
      runId: "runtime-router-tool"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "tool complete" });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.ModelEvent,
        event: expect.objectContaining({ type: ModelEventType.ToolIntent })
      })
    );
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.ToolResult);
  });

  it("uses a model plugin as the primary routed model", async () => {
    const runtime = createAgentRuntime({
      model: {
        id: "model-plugin",
        model: { providerId: "model-plugin-provider", modelId: "model-plugin-primary" },
        init(context) {
          context.registerProvider(
            createMockProvider([{ type: "final", content: "model plugin final" }], {
              id: "model-plugin-provider"
            })
          );
          context.registerModel({
            providerId: "model-plugin-provider",
            modelId: "model-plugin-primary",
            purposes: ["primary"],
            capabilities: { usage: "optional" }
          });
        }
      }
    });

    const result = await runtime.run({
      input: "hello",
      runId: "runtime-model-plugin"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "model plugin final" });
    const modelEvents = result.events
      .filter((event) => event.type === AgentEventType.ModelEvent)
      .map((event) => event.event.type);
    expect(modelEvents).toContain(ModelEventType.Selected);
  });

  it("returns structured run failures for router provider failures", async () => {
    const runtime = createAgentRuntime({
      routerPolicy: {
        primary: { providerId: "fatal-provider", modelId: "fatal-model" }
      }
    });
    runtime.registerProvider(
      createMockProvider(
        [
          {
            type: "failure",
            error: {
              category: ProviderErrorCategory.Fatal,
              code: "FATAL_PROVIDER",
              message: "fatal provider failure"
            }
          }
        ],
        { id: "fatal-provider" }
      )
    );
    runtime.registerModel({ providerId: "fatal-provider", modelId: "fatal-model", purposes: ["primary"] });

    const result = await runtime.run({
      input: "hello",
      providerId: "fatal-provider",
      runId: "runtime-router-fatal"
    });

    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_FAILED", message: "All provider router candidates failed" } });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: AgentEventType.ModelEvent,
        event: expect.objectContaining({ type: ModelEventType.ProviderError })
      })
    );
    expect(result.events).toContainEqual(expect.objectContaining({ type: AgentEventType.Error }));
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: AgentEventType.RunFinished, status: "failed" })
    );
  });
});

function durableRuntimeEvent(payload: DurableEventEnvelope["payload"], eventId: string): DurableEventEnvelope {
  const runId = typeof payload.runId === "string" ? payload.runId : undefined;
  const turn = typeof payload.turn === "number" ? payload.turn : undefined;
  return createDurableEventEnvelope({
    schemaVersion: 1,
    eventId,
    streamId: "session/session-1",
    streamRevision: Number(eventId.replace("event-", "")) - 1,
    sessionId: "session-1",
    branchId: "main",
    ...(runId ? { runId } : {}),
    ...(turn !== undefined ? { turn } : {}),
    parentEventId: null,
    previousEventHash: null,
    createdAt: "2026-05-27T00:00:00.000Z",
    actor: { type: "runtime", id: "test" },
    source: { type: "runtime", id: "core-test" },
    payload
  });
}

function eventStoreWith(events: DurableEventEnvelope[]): EventStore {
  return {
    append(event) {
      events.push(event);
      return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
    },
    readStream() {
      return { ok: true, events, nextRevision: events.length };
    }
  };
}

function sessionStoreWithVisibleEvents(visibleEventIds: string[]): SessionStore {
  const session = {
    id: "session-1",
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    activeBranchId: "main",
    rootBranchId: "main"
  };
  const branches = [{
    id: "main",
    sessionId: "session-1",
    createdAt: "2026-05-27T00:00:00.000Z",
    createdFrom: { type: "root" as const },
    visibleEventIds
  }];
  let activeLeaf = {
    sessionId: "session-1",
    branchId: "main",
    eventId: visibleEventIds.at(-1) ?? null,
    updatedAt: "2026-05-27T00:00:00.000Z",
    reason: "resume-selected" as const
  };

  return {
    createSession() {
      return { ok: true, session, branch: branches[0] };
    },
    getSessionTree() {
      return { ok: true, session, branches, activeLeaf };
    },
    forkBranch(options) {
      const through = visibleEventIds.indexOf(options.fromEventId);
      const branch = {
        id: options.branchId,
        sessionId: options.sessionId,
        parentBranchId: options.fromBranchId,
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "event" as const, branchId: options.fromBranchId, eventId: options.fromEventId },
        visibleEventIds: through === -1 ? [] : visibleEventIds.slice(0, through + 1)
      };
      branches.push(branch);
      return { ok: true, branch };
    },
    setActiveLeaf(options) {
      activeLeaf = {
        sessionId: options.sessionId,
        branchId: options.branchId,
        eventId: options.eventId,
        updatedAt: "2026-05-27T00:00:00.000Z",
        reason: options.reason
      };
      return { ok: true, leaf: activeLeaf };
    }
  };
}
