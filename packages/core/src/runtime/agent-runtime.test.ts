import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import { HookEffect, HookPhase } from "../contracts/hooks";
import { ModelEventType } from "../contracts/model-events";
import { ProviderErrorCategory } from "../contracts/provider";
import { createAgentRuntime } from "./create-agent-runtime";
import { createExamplePlugin } from "../testing/example-plugin";
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
