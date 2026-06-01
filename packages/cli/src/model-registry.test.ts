import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderCredentialStore } from "./provider-credential-store";
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

    expect(models).toContainEqual(
      expect.objectContaining({
        id: "fast",
        providerId: "openai",
        providerMode: "openai",
        modelId: "gpt-fast",
        authStatus: "configured",
        available: true,
        isDefault: true
      })
    );
    expect(models).toContainEqual(
      expect.objectContaining({
        id: "sonnet",
        providerId: "anthropic",
        providerMode: "anthropic",
        authStatus: "missing",
        available: false,
        unavailableReasons: ["missing-auth"]
      })
    );
    expect(models).toContainEqual(expect.objectContaining({
      id: "copilot",
      providerId: "copilot",
      source: "built-in",
      authStatus: "missing",
      available: false,
      unavailableReasons: ["missing-auth"]
    }));
    expect(models).toContainEqual(expect.objectContaining({
      id: "codex",
      providerId: "codex",
      source: "built-in",
      authStatus: "missing",
      available: false,
      unavailableReasons: ["missing-auth"]
    }));
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

    expect(models).toContainEqual(
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
    );
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

  it("makes built-in Copilot and Codex aliases selectable after OAuth credentials exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "guga-model-registry-"));
    const store = createProviderCredentialStore({ credentialsRoot: join(root, "credentials") });
    store.saveCredential({ providerId: "copilot", kind: "oauth", accessToken: "gho-copilot-secret", tokenType: "bearer" });
    store.saveCredential({ providerId: "codex", kind: "oauth", accessToken: "codex-secret", tokenType: "bearer" });

    const models = resolveModelRegistry({ config: {}, credentialRoot: root, env: {} });

    expect(models).toContainEqual(expect.objectContaining({
      id: "copilot",
      providerId: "copilot",
      authStatus: "configured",
      available: true
    }));
    expect(models).toContainEqual(expect.objectContaining({
      id: "codex",
      providerId: "codex",
      authStatus: "configured",
      available: true
    }));
    expect(selectResolvedModel({ config: {}, selector: "codex", credentialRoot: root, env: {} })).toMatchObject({
      id: "codex",
      providerId: "codex",
      modelId: "gpt-5.4",
      accessToken: "codex-secret",
      availability: expect.objectContaining({ available: true })
    });
    expect(JSON.stringify(models)).not.toContain("secret");
  });
});
