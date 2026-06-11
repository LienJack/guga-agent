import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import { ModelEventType } from "../contracts/model-events";
import { ProviderErrorCategory } from "../contracts/provider";
import { ModelInputProjector } from "../context/model-input-projection";
import { EventBus } from "../events/event-bus";
import { CapabilityRegistry } from "../registry/capability-registry";
import { createMockProvider } from "../testing/mock-provider";
import { createTestTool } from "../testing/test-tool";
import { ProviderRouter } from "./provider-router";

const request = {
  runId: "run-router",
  turn: 0,
  messages: [{ role: "user" as const, content: "hello" }],
  tools: []
};

describe("ProviderRouter", () => {
  it("selects the configured primary model and records model events", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(createMockProvider([{ type: "final", content: "ok", usage: { totalTokens: 3 } }]));
    registry.registerModel({ providerId: "mock", modelId: "primary", purposes: ["primary"] });

    const result = await new ProviderRouter({
      registry,
      policy: { primary: { providerId: "mock", modelId: "primary" } }
    }).route(request);

    expect(result).toMatchObject({ ok: true, response: { type: "final", content: "ok" } });
    expect(result.events.map((event) => event.type)).toEqual([
      ModelEventType.Requested,
      ModelEventType.Selected,
      ModelEventType.TextDelta,
      ModelEventType.Usage,
      ModelEventType.Finished
    ]);
  });

  it("selects an auxiliary model purpose from policy", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(createMockProvider([{ type: "final", content: "summary" }], { id: "mock" }));
    registry.registerModel({ providerId: "mock", modelId: "summarizer", purposes: ["summarizer"] });

    const result = await new ProviderRouter({
      registry,
      policy: {
        primary: { providerId: "mock", modelId: "primary" },
        purposes: [{ purpose: "summarizer", candidates: [{ providerId: "mock", modelId: "summarizer" }] }]
      }
    }).route({ ...request, purpose: "summarizer" });

    expect(result).toMatchObject({ ok: true, model: { providerId: "mock", modelId: "summarizer" } });
  });

  it("exposes selected model metadata for projection budgeting", () => {
    const registry = new CapabilityRegistry();
    registry.registerModel({ providerId: "mock", modelId: "primary", contextWindow: 100 });
    registry.registerModel({ providerId: "mock", modelId: "summarizer", contextWindow: 200 });
    const router = new ProviderRouter({
      registry,
      policy: {
        primary: { providerId: "mock", modelId: "primary" },
        purposes: [{ purpose: "summarizer", candidates: [{ providerId: "mock", modelId: "summarizer" }] }]
      }
    });

    expect(router.metadataFor()).toMatchObject({ modelId: "primary", contextWindow: 100 });
    expect(router.metadataFor("summarizer")).toMatchObject({ modelId: "summarizer", contextWindow: 200 });
  });

  it("records projection tool lease metadata on routed provider requests", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const tool = createTestTool({ name: "read_file", content: "unused" });
    registry.registerProvider(createMockProvider([{ type: "final", content: "ok" }]));
    registry.registerModel({ providerId: "mock", modelId: "primary", purposes: ["primary"] });
    const projection = new ModelInputProjector({ idFactory: () => "router" }).assemble({
      ...request,
      tools: [tool],
      toolLease: {
        leaseId: "lease-router",
        runId: request.runId,
        turn: request.turn,
        visibleToolNames: ["read_file"],
        decisions: [{ visible: true, toolName: "read_file", reason: "available" }]
      }
    });

    const result = await new ProviderRouter({
      registry,
      policy: { primary: { providerId: "mock", modelId: "primary" } }
    }).route({ ...request, tools: [tool], eventBus, projection });

    expect(result.ok).toBe(true);
    expect(eventBus.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ModelRequested,
      toolNames: ["read_file"],
      toolLease: expect.objectContaining({ leaseId: "lease-router" })
    }));
  });

  it("falls back after a non-retryable rate-limit failure", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider(
        [
          {
            type: "failure",
            error: {
              category: ProviderErrorCategory.RateLimit,
              code: "RATE_LIMITED",
              message: "slow down",
              retryable: false
            }
          },
          { type: "final", content: "fallback ok" }
        ],
        { id: "mock" }
      )
    );
    registry.registerModel({ providerId: "mock", modelId: "primary", purposes: ["primary"] });
    registry.registerModel({ providerId: "mock", modelId: "fallback", purposes: ["primary"] });

    const result = await new ProviderRouter({
      registry,
      policy: {
        primary: { providerId: "mock", modelId: "primary" },
        purposes: [
          {
            purpose: "primary",
            candidates: [
              { providerId: "mock", modelId: "primary" },
              { providerId: "mock", modelId: "fallback" }
            ]
          }
        ]
      }
    }).route({ ...request, purpose: "primary" });

    expect(result).toMatchObject({ ok: true, model: { providerId: "mock", modelId: "fallback" } });
    expect(result.events.map((event) => event.type)).toContain(ModelEventType.FallbackSelected);
  });

  it("retries retryable provider errors before succeeding", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider(
        [
          {
            type: "failure",
            error: {
              category: ProviderErrorCategory.Retryable,
              code: "TEMPORARY",
              message: "try again",
              retryable: true
            }
          },
          { type: "final", content: "retried ok" }
        ],
        { id: "mock" }
      )
    );
    registry.registerModel({ providerId: "mock", modelId: "primary", purposes: ["primary"] });

    const result = await new ProviderRouter({
      registry,
      policy: { primary: { providerId: "mock", modelId: "primary" }, maxRetries: 1 }
    }).route(request);

    expect(result).toMatchObject({ ok: true, response: { type: "final", content: "retried ok" } });
    expect(result.events.map((event) => event.type)).toContain(ModelEventType.RetryScheduled);
  });

  it("does not retry fatal provider errors", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(
      createMockProvider([
        {
          type: "failure",
          error: {
            category: ProviderErrorCategory.Fatal,
            code: "FATAL",
            message: "fatal"
          }
        },
        { type: "final", content: "should not happen" }
      ])
    );
    registry.registerModel({ providerId: "mock", modelId: "primary", purposes: ["primary"] });

    const result = await new ProviderRouter({
      registry,
      policy: { primary: { providerId: "mock", modelId: "primary" }, maxRetries: 2 }
    }).route(request);

    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_FAILED" } });
    expect(result.events.map((event) => event.type)).not.toContain(ModelEventType.RetryScheduled);
  });

  it("returns structured errors for missing model metadata", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(createMockProvider([{ type: "final", content: "unused" }]));

    const result = await new ProviderRouter({
      registry,
      policy: { primary: { providerId: "mock", modelId: "missing" } }
    }).route(request);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "MODEL_NOT_FOUND", message: "Model not registered: mock/missing" }
    });
  });

  it("returns structured errors when selected provider metadata has no provider", async () => {
    const registry = new CapabilityRegistry();
    registry.registerModel({ providerId: "missing-provider", modelId: "primary", purposes: ["primary"] });

    const result = await new ProviderRouter({
      registry,
      policy: { primary: { providerId: "missing-provider", modelId: "primary" } }
    }).route(request);

    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_NOT_FOUND" } });
    expect(result.events.map((event) => event.type)).toEqual([
      ModelEventType.Requested,
      ModelEventType.Selected
    ]);
  });

  it("normalizes thrown provider exceptions into provider error events", async () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider({
      id: "throwing",
      generate() {
        throw new Error("provider exploded");
      }
    });
    registry.registerModel({ providerId: "throwing", modelId: "primary", purposes: ["primary"] });

    const result = await new ProviderRouter({
      registry,
      policy: { primary: { providerId: "throwing", modelId: "primary" } }
    }).route(request);

    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_FAILED" } });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: ModelEventType.ProviderError,
        error: expect.objectContaining({ code: "PROVIDER_FAILED", message: "provider exploded" })
      })
    );
  });
});
