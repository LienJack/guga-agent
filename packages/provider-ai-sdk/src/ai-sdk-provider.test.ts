import { describe, expect, it, vi } from "vitest";
import { AiSdkProviderErrorCategory } from "./ai-sdk-usage-error-mapper";
import {
  createAiSdkProvider,
  createAiSdkProviderPlugin,
  mapAiSdkResultToProviderResponse
} from "./ai-sdk-provider";

describe("AI SDK provider bridge", () => {
  it("maps final text results to Guga provider responses", () => {
    expect(
      mapAiSdkResultToProviderResponse({
        text: "hello",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        finishReason: "stop",
        providerMetadata: { gateway: { generationId: "gen-1" } }
      })
    ).toEqual({
      type: "final",
      content: "hello",
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        cost: { status: "unknown", reason: "AI SDK result did not include Guga pricing metadata" }
      },
      finishReason: "stop",
      raw: [{ label: "ai-sdk.providerMetadata", value: { gateway: { generationId: "gen-1" } } }]
    });
  });

  it("maps AI SDK tool calls to Guga tool intent responses", () => {
    expect(
      mapAiSdkResultToProviderResponse({
        text: "I will call a tool",
        toolCalls: [{ toolCallId: "call-1", toolName: "echo", input: { value: "hi" } }],
        finishReason: "tool-calls"
      })
    ).toEqual({
      type: "tool_calls",
      content: "I will call a tool",
      toolCalls: [{ id: "call-1", name: "echo", input: { value: "hi" } }],
      finishReason: "tool-calls"
    });
  });

  it("calls injected generateText without real API keys or network", async () => {
    const generateText = vi.fn(async () => ({
      text: "stubbed",
      usage: { totalTokens: 4 },
      finishReason: "stop"
    }));
    const provider = createAiSdkProvider(
      { id: "ai-sdk", mode: "openai-compatible", modelId: "local-model", baseURL: "http://localhost:11434/v1" },
      { generateText, modelFactory: () => "fake-model" }
    );

    const response = await provider.generate({
      messages: [{ role: "user", content: "hello" }],
      tools: []
    });

    expect(response).toMatchObject({ type: "final", content: "stubbed" });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fake-model",
        messages: [{ role: "user", content: "hello" }],
        tools: {},
        toolChoice: "none",
        maxRetries: 0
      })
    );
  });

  it("uses the router-selected model id when present on the request", async () => {
    const modelFactory = vi.fn(() => "selected-model");
    const provider = createAiSdkProvider(
      { id: "ai-sdk", mode: "openai-compatible", modelId: "default-model" },
      { generateText: async () => ({ text: "ok" }), modelFactory }
    );

    await provider.generate({
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "ai-sdk", modelId: "router-selected" }
    });

    expect(modelFactory).toHaveBeenCalledWith(expect.objectContaining({ modelId: "router-selected" }));
  });

  it("returns normalized provider failures from AI SDK errors", async () => {
    const provider = createAiSdkProvider(
      { id: "ai-sdk", mode: "openai", modelId: "gpt-test" },
      {
        modelFactory: () => "fake-model",
        generateText: async () => {
          throw Object.assign(new Error("payment required"), { statusCode: 402 });
        }
      }
    );

    const response = await provider.generate({ messages: [{ role: "user", content: "hello" }], tools: [] });

    expect(response).toMatchObject({
      type: "failure",
      error: {
        category: AiSdkProviderErrorCategory.Payment,
        code: "HTTP_402",
        providerId: "ai-sdk",
        modelId: "gpt-test"
      }
    });
  });

  it("creates a plugin that registers provider and model metadata", () => {
    const plugin = createAiSdkProviderPlugin(
      {
        id: "ai-sdk",
        mode: "anthropic",
        modelId: "claude-test",
        metadata: {
          purposes: ["primary"],
          capabilities: { toolCalling: true, usage: "optional" }
        }
      },
      { generateText: async () => ({ text: "unused" }), modelFactory: () => "fake-model" }
    );
    const registered: unknown[] = [];

    plugin.init({
      pluginId: "ai-sdk",
      registerProvider(provider) {
        registered.push(provider);
      },
      registerModel(model) {
        registered.push(model);
      },
      registerTool() {},
      registerHook() {}
    });

    expect(registered).toEqual([
      expect.objectContaining({ id: "ai-sdk" }),
      expect.objectContaining({
        providerId: "ai-sdk",
        modelId: "claude-test",
        capabilities: { toolCalling: true, usage: "optional" }
      })
    ]);
  });
});
