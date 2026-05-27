import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "./agent-loop";
import { ContextSourceKind, ContextSourcePriority, type ContextSourceDescriptor } from "../contracts/context";
import { AgentEventType } from "../contracts/events";
import { HookEffect, HookPhase } from "../contracts/hooks";
import type { DurableEventEnvelope, EventStore } from "../contracts/persistence";
import { ProviderErrorCategory } from "../contracts/provider";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ProviderRouter } from "../router/provider-router";
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
      AgentEventType.ContextProjectionCreated,
      AgentEventType.ModelRequested,
      AgentEventType.ProviderInputCommitted,
      AgentEventType.ModelEvent,
      AgentEventType.ModelEvent,
      AgentEventType.ModelResponded,
      AgentEventType.ToolQueued,
      AgentEventType.PermissionResolved,
      AgentEventType.ToolStarted,
      AgentEventType.ToolResult,
      AgentEventType.ToolCompleted,
      AgentEventType.ContextProjectionCreated,
      AgentEventType.ModelRequested,
      AgentEventType.ProviderInputCommitted,
      AgentEventType.ModelEvent,
      AgentEventType.ModelEvent,
      AgentEventType.ModelResponded,
      AgentEventType.RunFinished
    ]);
  });

  it("creates a projection before each provider request", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "echo", input: { value: "hello" } }] },
        { type: "final", content: "done" }
      ])
    );
    registry.registerTool(createTestTool({ name: "echo", content: "hello" }));

    const result = await new AgentLoop({ registry, eventBus }).run({
      input: "Use echo",
      providerId: "mock",
      runId: "run-projection"
    });

    expect(result.ok).toBe(true);
    const projections = result.events.filter((event) => event.type === AgentEventType.ContextProjectionCreated);
    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({
      projection: {
        messages: [{ role: "user", content: "Use echo" }],
        sourceDescriptors: expect.arrayContaining([
          expect.objectContaining({ kind: "pending_turn" }),
          expect.objectContaining({ kind: "active_tool", metadata: { toolName: "echo" } })
        ])
      }
    });
    expect(projections[1]).toMatchObject({
      projection: {
        sourceDescriptors: expect.arrayContaining([
          expect.objectContaining({ kind: "tool_result_preview", provenance: expect.objectContaining({ toolCallId: "call-1" }) })
        ])
      }
    });
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

  it("returns unregistered tool intents as model-visible observations", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-1", name: "missing", input: {} }] },
        (request) => {
          const last = request.messages.at(-1);
          return {
            type: "final",
            content: last?.role === "tool" && last.isError ? last.content : "missing tool observation"
          };
        }
      ])
    );

    const result = await new AgentLoop({ registry }).run({
      input: "Use missing tool",
      providerId: "mock",
      runId: "run-3"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "TOOL_NOT_FOUND: Tool not registered: missing" });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.ToolResult);
  });

  it("filters hidden and unavailable tools before provider projection", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        (request) => ({
          type: "final",
          content: request.tools.map((tool) => tool.name).join(",")
        })
      ])
    );
    registry.registerTool(createTestTool({ name: "visible", content: "ok" }));
    registry.registerTool({
      ...createTestTool({ name: "hidden", content: "no" }),
      runtime: { visibility: "hidden" }
    });
    registry.registerTool({
      ...createTestTool({ name: "missing-backend", content: "no" }),
      runtime: { availability: { status: "missing-backend", reason: "not configured" } }
    });
    registry.registerTool({
      ...createTestTool({ name: "dynamic-denied", content: "no" }),
      runtime: { availability: () => ({ status: "denied-by-policy", reason: "policy disabled" }) }
    });
    registry.registerTool({
      ...createTestTool({ name: "headless-denied", content: "no" }),
      effect: "execute",
      runtime: { permission: { defaultAction: "ask" } }
    });

    const result = await new AgentLoop({ registry, availabilityContext: { profile: "headless" } }).run({
      input: "hello",
      providerId: "mock",
      runId: "run-visible-tools"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "visible" });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ToolVisibilityFiltered,
      decision: expect.objectContaining({ toolName: "dynamic-denied", reason: "policy-denied" })
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ToolVisibilityFiltered,
      decision: expect.objectContaining({ toolName: "headless-denied", reason: "policy-denied" })
    }));
  });

  it("uses scheduler metadata to serialize conflicting path writes", async () => {
    const registry = new CapabilityRegistry();
    const executed: string[] = [];
    registry.registerProvider(
      createMockProvider([
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call-a", name: "write_file", input: { path: "/workspace/src" } },
            { id: "call-b", name: "write_file", input: { path: "/workspace/src/file.ts" } }
          ]
        },
        { type: "final", content: "done" }
      ])
    );
    registry.registerTool({
      name: "write_file",
      description: "Write",
      inputSchema: { type: "object", required: ["path"] },
      effect: "write",
      runtime: {
        permission: { defaultAction: "allow" },
        scheduler: {
          concurrency: "resource-scoped",
          resources: {
            mode: "extractor",
            extract(input) {
              return [{ kind: "path", access: "write", value: String((input as { path: string }).path) }];
            }
          }
        }
      },
      execute(input) {
        executed.push(String((input as { path: string }).path));
        return { ok: true, content: "ok" };
      }
    });

    const result = await new AgentLoop({ registry }).run({
      input: "write",
      providerId: "mock",
      runId: "run-scheduler"
    });

    expect(result.ok).toBe(true);
    expect(executed).toEqual(["/workspace/src", "/workspace/src/file.ts"]);
  });

  it("adds batch correlation to tool lifecycle events", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call-a", name: "read_a", input: {} },
            { id: "call-b", name: "read_b", input: {} }
          ]
        },
        { type: "final", content: "done" }
      ])
    );
    registry.registerTool(createTestTool({ name: "read_a", content: "a" }));
    registry.registerTool(createTestTool({ name: "read_b", content: "b" }));

    const result = await new AgentLoop({ registry }).run({
      input: "read",
      providerId: "mock",
      runId: "run-batches"
    });

    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ToolCompleted,
      correlation: expect.objectContaining({ batchId: "turn-0-batch-0" })
    }));
  });

  it("returns synthetic tool results for accepted calls when the run is already aborted", async () => {
    const registry = new CapabilityRegistry();
    const controller = new AbortController();
    controller.abort();
    registry.registerProvider(
      createMockProvider([
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call-a", name: "read_a", input: {} },
            { id: "call-b", name: "read_b", input: {} }
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
    registry.registerTool(createTestTool({ name: "read_a", content: "a" }));
    registry.registerTool(createTestTool({ name: "read_b", content: "b" }));

    const result = await new AgentLoop({ registry }).run({
      input: "read",
      providerId: "mock",
      runId: "run-aborted-tools",
      signal: controller.signal
    });

    expect(result).toMatchObject({
      ok: true,
      finalAnswer: "TOOL_CANCELLED: Tool call was cancelled before execution | TOOL_CANCELLED: Tool call was cancelled before execution"
    });
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

  it("durably records provider request and provider-input facts before calling a direct provider", async () => {
    const registry = new CapabilityRegistry();
    const order: string[] = [];
    registry.registerProvider({
      id: "side-effect-provider",
      generate() {
        order.push("provider");
        return { type: "final", content: "ok" };
      }
    });
    const eventBus = durableEventBus({ order });

    const result = await new AgentLoop({ registry, eventBus }).run({
      input: "hello",
      providerId: "side-effect-provider",
      runId: "run-provider-durable"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "ok" });
    expect(order.slice(0, 5)).toEqual([
      `append:${AgentEventType.RunStarted}`,
      `append:${AgentEventType.ContextProjectionCreated}`,
      `append:${AgentEventType.ModelRequested}`,
      `append:${AgentEventType.ProviderInputCommitted}`,
      "provider"
    ]);
  });

  it("does not call a direct provider when durable provider-input append fails", async () => {
    const registry = new CapabilityRegistry();
    const generate = vi.fn(() => ({ type: "final" as const, content: "should not run" }));
    registry.registerProvider({ id: "blocked-provider", generate });
    const eventBus = durableEventBus({ failTypes: new Set([AgentEventType.ProviderInputCommitted]) });

    const result = await new AgentLoop({ registry, eventBus }).run({
      input: "hello",
      providerId: "blocked-provider",
      runId: "run-provider-blocked"
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_FAILED", message: "Provider input was not durably recorded" }
    });
  });

  it("compacts and retries the current intent once after provider context overflow", async () => {
    const registry = new CapabilityRegistry();
    const seenMessages: unknown[] = [];
    registry.registerProvider(
      createMockProvider([
        {
          type: "failure",
          error: {
            category: ProviderErrorCategory.ContextOverflow,
            code: "CONTEXT_OVERFLOW",
            message: "prompt too long"
          }
        },
        (request) => {
          seenMessages.push(request.messages);
          return request.messages.some((message) => message.role === "user" && message.content.includes("Compaction summary"))
            ? { type: "final", content: "recovered" }
            : {
                type: "failure",
                error: {
                  category: ProviderErrorCategory.ContextOverflow,
                  code: "CONTEXT_OVERFLOW",
                  message: "still too long"
                }
              };
        }
      ])
    );

    const result = await new AgentLoop({ registry }).run({
      input: "hello",
      providerId: "mock",
      runId: "run-overflow"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "recovered" });
    expect(seenMessages).toHaveLength(1);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ContextCompactStarted,
      trigger: "provider-overflow"
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ContextCompactCompleted,
      result: expect.objectContaining({
        summary: expect.objectContaining({
          objective: "hello",
          completedWork: [],
          currentBlockers: [],
          nextSteps: []
        })
      })
    }));
  });

  it("recovers routed context overflow using preserved provider error details", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(createMockProvider([
      {
        type: "failure",
        error: {
          category: ProviderErrorCategory.ContextOverflow,
          code: "CONTEXT_OVERFLOW",
          message: "prompt too long"
        }
      },
      (request) => request.messages.some((message) => message.role === "user" && message.content.includes("Compaction summary"))
        ? { type: "final", content: "router recovered" }
        : {
            type: "failure",
            error: {
              category: ProviderErrorCategory.ContextOverflow,
              code: "CONTEXT_OVERFLOW",
              message: "still too long"
            }
          }
    ]));
    registry.registerModel({ providerId: "mock", modelId: "primary", contextWindow: 100 });
    const result = await new AgentLoop({
      registry,
      router: new ProviderRouter({ registry, policy: { primary: { providerId: "mock", modelId: "primary" } } })
    }).run({ input: "hello", runId: "run-router-overflow" });

    expect(result).toMatchObject({ ok: true, finalAnswer: "router recovered" });
    expect(result.events).toContainEqual(expect.objectContaining({ type: AgentEventType.ContextCompactCompleted }));
  });

  it("durably records compaction start, pre-commit, and terminal markers before retrying", async () => {
    const registry = new CapabilityRegistry();
    const durableRecords: DurableEventEnvelope[] = [];
    registry.registerProvider(createMockProvider([
      {
        type: "failure",
        error: {
          category: ProviderErrorCategory.ContextOverflow,
          code: "CONTEXT_OVERFLOW",
          message: "prompt too long"
        }
      },
      { type: "final", content: "recovered" }
    ]));
    const eventBus = durableEventBus({ durableRecords });

    const result = await new AgentLoop({ registry, eventBus }).run({
      input: "hello",
      providerId: "mock",
      runId: "run-durable-compact"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "recovered" });
    expect(durableRecords.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      AgentEventType.ContextCompactStarted,
      "context.compact.pre_commit",
      AgentEventType.ContextCompactCompleted
    ]));
    expect(
      durableRecords.findIndex((event) => event.eventType === "context.compact.pre_commit")
    ).toBeLessThan(
      durableRecords.findIndex((event) => event.eventType === AgentEventType.ContextCompactCompleted)
    );
  });

  it("runs context hooks during projection and honors compact gate denials", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const assemble = vi.fn(() => ({
      id: "assemble-observed",
      kind: "annotation" as const,
      phase: HookPhase.ContextAssemble,
      sourceIds: [],
      reason: "observed"
    }));
    hookKernel.registerHook("context-plugin", 0, {
      id: "assemble",
      phase: HookPhase.ContextAssemble,
      effect: HookEffect.Annotate,
      handler: assemble
    });
    hookKernel.registerHook("context-plugin", 0, {
      id: "deny-compact",
      phase: HookPhase.ContextCompactBefore,
      effect: HookEffect.Gate,
      handler() {
        return {
          id: "deny-compact",
          kind: "gate",
          phase: HookPhase.ContextCompactBefore,
          allowed: false,
          reason: "no compact"
        };
      }
    });
    registry.registerProvider(createMockProvider([
      {
        type: "failure",
        error: {
          category: ProviderErrorCategory.ContextOverflow,
          code: "CONTEXT_OVERFLOW",
          message: "prompt too long"
        }
      }
    ]));

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "hello",
      providerId: "mock",
      runId: "run-context-hooks"
    });

    expect(result).toMatchObject({ ok: false, error: { code: "HOOK_FAILED", message: "no compact" } });
    expect(assemble).toHaveBeenCalled();
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ContextHookDecision,
      hookId: "assemble"
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ContextHookDecision,
      hookId: "deny-compact"
    }));
  });

  it("runs resource discovery, truncation, proactive compaction, and reinjection before the provider call", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const seenProviderMessages: unknown[] = [];
    const phases: string[] = [];
    registry.registerProvider(createMockProvider([
      (request) => {
        seenProviderMessages.push(request.messages);
        return { type: "final", content: request.messages.map((message) => message.content).join("\n") };
      }
    ]));
    registry.registerModel({ providerId: "mock", modelId: "mock", contextWindow: 80, maxOutputTokens: 10 });
    registry.registerTool(createTestTool({ name: "echo", content: "ok" }));
    hookKernel.registerHook("context-plugin", 0, {
      id: "discover-resource",
      phase: HookPhase.ResourcesDiscover,
      effect: HookEffect.Patch,
      handler() {
        phases.push(HookPhase.ResourcesDiscover);
        return {
          id: "resource-source",
          kind: "source-contribution",
          phase: HookPhase.ResourcesDiscover,
          sourceIds: ["resource:file"],
          metadata: {
            sources: [
              sourceDescriptor("old-history", ContextSourceKind.History, 60),
              sourceDescriptor("resource:file", ContextSourceKind.ResourceFile, 90)
            ]
          }
        };
      }
    });
    hookKernel.registerHook("context-plugin", 0, {
      id: "truncate-observer",
      phase: HookPhase.ContextTruncate,
      effect: HookEffect.Annotate,
      handler() {
        phases.push(HookPhase.ContextTruncate);
        return {
          id: "truncate-observed",
          kind: "annotation",
          phase: HookPhase.ContextTruncate,
          sourceIds: []
        };
      }
    });
    hookKernel.registerHook("context-plugin", 0, {
      id: "reinject-host",
      phase: HookPhase.ContextReinject,
      effect: HookEffect.Patch,
      handler() {
        phases.push(HookPhase.ContextReinject);
        return {
          id: "host-reinject",
          kind: "reinjection",
          phase: HookPhase.ContextReinject,
          sourceIds: ["host-context"],
          reason: "restore host context",
          metadata: {
            reinjectionSources: [{
              id: "host-context",
              kind: ContextSourceKind.HostContext,
              priority: ContextSourcePriority.Medium,
              content: "Host context survived compaction",
              runtimeContextId: "run-proactive"
            }]
          }
        };
      }
    });

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "hello",
      providerId: "mock",
      modelId: "mock",
      runId: "run-proactive",
      maxTurns: 3
    });

    expect(result).toMatchObject({ ok: true });
    expect(phases).toEqual(expect.arrayContaining([
      HookPhase.ResourcesDiscover,
      HookPhase.ContextTruncate,
      HookPhase.ContextReinject
    ]));
    expect(result.events.findIndex((event) => event.type === AgentEventType.ContextCompactStarted))
      .toBeLessThan(result.events.findIndex((event) => event.type === AgentEventType.ModelRequested));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ContextCompactStarted,
      trigger: "proactive-threshold"
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ContextReinjected,
      sources: expect.arrayContaining([
        expect.objectContaining({ id: "host-context" }),
        expect.objectContaining({ id: "reinjected-tool-echo" }),
        expect.objectContaining({ id: "reinjected-permission-mode" })
      ])
    }));
    expect(seenProviderMessages).toHaveLength(1);
    expect(String(result.finalAnswer)).toContain("Compaction summary");
    expect(String(result.finalAnswer)).toContain("Host context survived compaction");
  });

  it("honors context.compact.after gate denials after compaction is recorded", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    registry.registerProvider(createMockProvider([
      {
        type: "failure",
        error: {
          category: ProviderErrorCategory.ContextOverflow,
          code: "CONTEXT_OVERFLOW",
          message: "prompt too long"
        }
      }
    ]));
    hookKernel.registerHook("context-plugin", 0, {
      id: "deny-after",
      phase: HookPhase.ContextCompactAfter,
      effect: HookEffect.Gate,
      handler() {
        return {
          id: "deny-after",
          kind: "gate",
          phase: HookPhase.ContextCompactAfter,
          allowed: false,
          reason: "post compact rejected"
        };
      }
    });

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "hello",
      providerId: "mock",
      runId: "run-deny-after"
    });

    expect(result).toMatchObject({ ok: false, error: { code: "HOOK_FAILED", message: "post compact rejected" } });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ContextCompactCompleted
    }));
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
      createMockProvider([
        { type: "tool_calls", toolCalls: [{ id: "call-missing", name: "missing", input: {} }] },
        (request) => {
          const last = request.messages.at(-1);
          return {
            type: "final",
            content: last?.role === "tool" && last.isError ? last.content : "missing tool observation"
          };
        }
      ])
    );

    const result = await new AgentLoop({ registry, eventBus, hookKernel }).run({
      input: "Use missing",
      providerId: "mock",
      runId: "run-gate-missing"
    });

    expect(result).toMatchObject({ ok: true, finalAnswer: "TOOL_NOT_FOUND: Tool not registered: missing" });
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.HookDecision);
  });
});

function sourceDescriptor(id: string, kind: ContextSourceKind, tokens: number): ContextSourceDescriptor {
  return {
    id,
    kind,
    priority: ContextSourcePriority.Low,
    provenance: { origin: "host" },
    tokenEstimate: { status: "estimated", tokens },
    contentHash: id,
    modelVisible: true
  };
}

function durableEventBus(options: {
  failTypes?: Set<string>;
  order?: string[];
  durableRecords?: DurableEventEnvelope[];
} = {}): EventBus {
  const events = options.durableRecords ?? [];
  const store: EventStore = {
    append(event) {
      options.order?.push(`append:${event.eventType}`);
      if (options.failTypes?.has(event.eventType)) {
        return { ok: false, status: "unavailable", reason: `failed ${event.eventType}` };
      }
      events.push(event);
      return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
    },
    readStream() {
      return { ok: true, events, nextRevision: events.length };
    }
  };
  return new EventBus({
    durableContext: () => ({
      eventStore: store,
      session: { sessionId: "session-1", branchId: "main" }
    })
  });
}
