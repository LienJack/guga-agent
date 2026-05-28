import { describe, expect, it } from "vitest";
import { resolveModelRegistry, selectResolvedModel } from "./model-registry";

describe("CLI model registry view", () => {
  it("combines provider auth, config aliases, and availability without leaking secrets", () => {
    const models = resolveModelRegistry({
      config: {
        defaultModel: "fast",
        providers: [
          { id: "openai", mode: "openai", apiKeyEnv: "OPENAI_API_KEY" },
          { id: "anthropic", mode: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" }
        ],
        models: [
          { id: "fast", providerId: "openai", modelId: "gpt-fast", label: "Fast", capabilities: { toolCalling: true } },
          { id: "sonnet", providerId: "anthropic", modelId: "claude-sonnet" }
        ]
      },
      env: { OPENAI_API_KEY: "sk-test-secret-1234" }
    });

    expect(models).toEqual([
      expect.objectContaining({
        id: "fast",
        providerId: "openai",
        providerMode: "openai",
        modelId: "gpt-fast",
        authStatus: "configured",
        available: true,
        isDefault: true
      }),
      expect.objectContaining({
        id: "sonnet",
        providerId: "anthropic",
        providerMode: "anthropic",
        authStatus: "missing",
        available: false,
        unavailableReasons: ["missing-auth"]
      })
    ]);
    expect(JSON.stringify(models)).not.toContain("sk-test-secret-1234");
  });

  it("merges registered extension model metadata into the same view", () => {
    const models = resolveModelRegistry({
      config: {
        providers: [{ id: "extension-provider", mode: "openai-compatible", baseURL: "http://extension.example" }]
      },
      registeredModels: [{
        providerId: "extension-provider",
        modelId: "extension-model",
        displayName: "Extension Model",
        purposes: ["auxiliary"],
        capabilities: { toolCalling: false, usage: "optional" }
      }],
      env: {}
    });

    expect(models).toEqual([
      expect.objectContaining({
        id: "extension-provider/extension-model",
        label: "Extension Model",
        providerId: "extension-provider",
        providerMode: "openai-compatible",
        source: "registered",
        authStatus: "unknown",
        healthStatus: "unknown",
        available: true,
        baseURL: "http://extension.example"
      })
    ]);
  });

  it("selects only available aliases and returns call material separately", () => {
    const selected = selectResolvedModel({
      config: {
        defaultModel: "fast",
        providers: [{ id: "openai", mode: "openai", apiKeyEnv: "OPENAI_API_KEY" }],
        models: [{ id: "fast", providerId: "openai", modelId: "gpt-fast" }]
      },
      env: { OPENAI_API_KEY: "sk-test-secret-1234" }
    });

    expect(selected).toMatchObject({
      id: "fast",
      providerId: "openai",
      providerMode: "openai",
      modelId: "gpt-fast",
      apiKey: "sk-test-secret-1234",
      availability: expect.objectContaining({ available: true })
    });
  });

  it("rejects missing-auth aliases for switching", () => {
    expect(selectResolvedModel({
      config: {
        providers: [{ id: "anthropic", mode: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" }],
        models: [{ id: "sonnet", providerId: "anthropic", modelId: "claude-sonnet" }]
      },
      selector: "sonnet",
      env: {}
    })).toBeUndefined();
  });
});
