import { describe, expect, it } from "vitest";
import { AgentEventType } from "./events";
import {
  HookEffect,
  HookPhase,
  type ModelRequestPatch,
  type ModelResponseAnnotation,
  type PreToolGateDecision
} from "./hooks";
import { ModelEventType, type ModelEvent } from "./model-events";
import type { CoreMessage, ToolCall } from "./messages";
import type { LocalPlugin } from "./plugins";
import {
  ProviderErrorCategory,
  type ModelMetadata,
  type ProviderError,
  type ProviderResponse,
  type Usage
} from "./provider";
import type { ToolResult } from "./tools";

describe("core contracts", () => {
  it("can express a user to tool to final message sequence", () => {
    const call: ToolCall = { id: "call-1", name: "echo", input: { value: "hi" } };
    const messages: CoreMessage[] = [
      { role: "user", content: "Say hi through a tool" },
      { role: "assistant", toolCalls: [call] },
      { role: "tool", toolCallId: call.id, name: call.name, content: "hi", isError: false },
      { role: "assistant", content: "hi" }
    ];

    expect(messages.at(1)).toMatchObject({ role: "assistant", toolCalls: [call] });
    expect(messages.at(2)).toMatchObject({ role: "tool", toolCallId: "call-1" });
  });

  it("can express a structured tool failure observation", () => {
    const result: ToolResult = {
      ok: false,
      error: { code: "TEST_TOOL_FAILED", message: "The test tool failed" }
    };
    const observation: CoreMessage = {
      role: "tool",
      toolCallId: "call-2",
      name: "fail",
      content: "TEST_TOOL_FAILED: The test tool failed",
      isError: true
    };

    expect(result.ok).toBe(false);
    expect(observation.isError).toBe(true);
  });

  it("keeps provider responses independent from provider SDK types", () => {
    const response: ProviderResponse = {
      type: "tool_calls",
      toolCalls: [{ id: "call-3", name: "echo", input: { value: "hi" } }],
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    };

    expect(response.type).toBe("tool_calls");
    expect(response.usage?.totalTokens).toBe(3);
  });

  it("can express model metadata, usage, and unknown cost without provider SDK types", () => {
    const metadata: ModelMetadata = {
      providerId: "ai-sdk",
      modelId: "openai/gpt-4.1-mini",
      purposes: ["primary", "summarizer"],
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      capabilities: {
        toolCalling: true,
        streaming: true,
        reasoning: false,
        usage: "optional"
      }
    };
    const usage: Usage = {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      cost: { status: "unknown", reason: "pricing metadata unavailable" }
    };

    expect(metadata.capabilities?.toolCalling).toBe(true);
    expect(usage.cost?.status).toBe("unknown");
  });

  it("can express normalized provider errors with routing metadata", () => {
    const error: ProviderError = {
      category: ProviderErrorCategory.RateLimit,
      code: "RATE_LIMITED",
      message: "The provider rejected the request because of rate limits",
      retryable: true,
      providerId: "ai-sdk",
      modelId: "openai/gpt-4.1-mini",
      requestId: "req-123",
      statusCode: 429,
      metadata: { retryAfterMs: 1_000 }
    };

    expect(error.category).toBe("rate-limit");
    expect(error.retryable).toBe(true);
  });

  it("can express model events for text, tool intent, usage, finish, and provider errors", () => {
    const call: ToolCall = { id: "call-model-1", name: "search", input: { q: "guga" } };
    const events: ModelEvent[] = [
      {
        type: ModelEventType.TextDelta,
        runId: "run-model",
        turn: 0,
        providerId: "ai-sdk",
        modelId: "openai/gpt-4.1-mini",
        delta: "hello"
      },
      {
        type: ModelEventType.ToolIntent,
        runId: "run-model",
        turn: 0,
        providerId: "ai-sdk",
        modelId: "openai/gpt-4.1-mini",
        toolCall: call
      },
      {
        type: ModelEventType.Usage,
        runId: "run-model",
        turn: 0,
        usage: { inputTokens: 1, outputTokens: 2, cost: { status: "unknown" } }
      },
      {
        type: ModelEventType.Finished,
        runId: "run-model",
        turn: 0,
        finishReason: "tool-calls"
      },
      {
        type: ModelEventType.ProviderError,
        runId: "run-model",
        turn: 0,
        error: {
          category: ProviderErrorCategory.Auth,
          code: "AUTH_FAILED",
          message: "Invalid credentials"
        }
      }
    ];

    expect(events.map((event) => event.type)).toContain(ModelEventType.ToolIntent);
  });

  it("can express model hook request patches and response annotations without executing hooks", () => {
    const patch: ModelRequestPatch = {
      messages: [{ role: "user", content: "patched" }],
      metadata: { source: "fixture" }
    };
    const annotation: ModelResponseAnnotation = {
      annotations: { policy: "observed" }
    };

    expect(patch.messages?.[0]).toMatchObject({ role: "user", content: "patched" });
    expect(annotation.annotations.policy).toBe("observed");
  });

  it("can express a local plugin that registers provider, tool, and hook capabilities", () => {
    const plugin: LocalPlugin = {
      id: "example",
      init(context) {
        context.registerProvider({
          id: "example-provider",
          generate() {
            return { type: "final", content: "ok" };
          }
        });
        context.registerModel({
          providerId: "example-provider",
          modelId: "example-model",
          capabilities: { usage: "optional" }
        });
        context.registerTool({
          name: "example-tool",
          description: "Example tool",
          inputSchema: { type: "object" },
          effect: "read",
          execute() {
            return { ok: true, content: "ok" };
          }
        });
        context.registerHook({
          id: "example-gate",
          phase: HookPhase.PreToolGate,
          effect: HookEffect.Gate,
          handler() {
            return { type: "allow" };
          }
        });
      }
    };

    expect(plugin.id).toBe("example");
  });

  it("can express pre-tool gate allow and deny decisions", () => {
    const allow: PreToolGateDecision = { type: "allow" };
    const deny: PreToolGateDecision = {
      type: "deny",
      reason: "blocked by policy",
      metadata: { policy: "test" }
    };

    expect(allow.type).toBe("allow");
    expect(deny.reason).toBe("blocked by policy");
  });

  it("can express plugin lifecycle, hook decision, and structured failure events", () => {
    const call: ToolCall = { id: "call-4", name: "blocked", input: {} };

    expect([
      {
        type: AgentEventType.PluginCapabilityRegistered,
        runId: "run-contract",
        pluginId: "example",
        capability: "provider",
        name: "example-provider"
      },
      {
        type: AgentEventType.HookDecision,
        runId: "run-contract",
        phase: "pre_tool.gate",
        pluginId: "example",
        hookId: "example-gate",
        call,
        decision: { type: "deny", reason: "blocked" }
      },
      {
        type: AgentEventType.ModelEvent,
        runId: "run-contract",
        turn: 0,
        event: {
          type: ModelEventType.Finished,
          runId: "run-contract",
          turn: 0,
          finishReason: "stop"
        }
      },
      {
        type: AgentEventType.PluginFailure,
        runId: "run-contract",
        pluginId: "example",
        failure: "init",
        code: "PLUGIN_INIT_FAILED",
        message: "Init failed"
      }
    ]).toHaveLength(4);
  });
});
