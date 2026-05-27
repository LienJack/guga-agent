import { describe, expect, it } from "vitest";
import { createAgentRuntime } from "@guga-agent/core";
import { checkProviderHealth } from "./provider-health";
import { createOpsHealthPlugin } from "./ops-health-plugin";
import { redactSecret, resolveCredentialConfig } from "./config-resolver";

describe("plugin-ops-health", () => {
  it("redacts env credential config without leaking raw secrets", () => {
    const view = resolveCredentialConfig({
      providerId: "openai",
      source: "env",
      env: { OPENAI_API_KEY: "sk-test-secret-1234" },
      requiredKeys: ["OPENAI_API_KEY"]
    });

    expect(view).toMatchObject({
      providerId: "openai",
      source: "env",
      status: "configured",
      redacted: { OPENAI_API_KEY: "sk-...1234" },
      diagnostics: []
    });
    expect(JSON.stringify(view)).not.toContain("secret");
    expect(redactSecret("short")).toBe("<redacted>");
  });

  it("reports missing credential config", () => {
    const view = resolveCredentialConfig({
      providerId: "anthropic",
      source: "env",
      env: {},
      requiredKeys: ["ANTHROPIC_API_KEY"]
    });

    expect(view.status).toBe("missing");
    expect(view.redacted.ANTHROPIC_API_KEY).toBe("<missing>");
    expect(view.diagnostics).toContainEqual(expect.objectContaining({ code: "CREDENTIAL_MISSING" }));
  });

  it("checks provider health with injectable healthy and failed checks", async () => {
    await expect(checkProviderHealth({
      target: { providerId: "mock", modelId: "small" },
      now: () => new Date("2026-05-28T00:00:00.000Z"),
      check: () => ({ status: "healthy" })
    })).resolves.toMatchObject({
      providerId: "mock",
      modelId: "small",
      status: "healthy",
      checkedAt: "2026-05-28T00:00:00.000Z",
      diagnostics: []
    });

    await expect(checkProviderHealth({
      target: { providerId: "mock" },
      now: () => new Date("2026-05-28T00:00:00.000Z"),
      check: () => {
        throw new Error("network down");
      }
    })).resolves.toMatchObject({
      status: "unavailable",
      diagnostics: [expect.objectContaining({ code: "HEALTH_CHECK_FAILED", message: "network down" })]
    });
  });

  it("registers operational capability descriptors", async () => {
    const runtime = createAgentRuntime({
      plugins: [createOpsHealthPlugin({ pluginId: "ops" })]
    });

    await runtime.run({ input: "missing provider", providerId: "missing", runId: "run-ops" });

    expect(runtime.listCapabilityDescriptors?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "operation",
        name: "provider.health",
        source: "plugin",
        ownerPluginId: "ops",
        trust: expect.objectContaining({ level: "first-party" })
      }),
      expect.objectContaining({
        type: "operation",
        name: "provider.config",
        source: "plugin",
        ownerPluginId: "ops"
      })
    ]));
  });
});
