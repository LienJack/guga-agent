import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { redactSecret, resolveProviderAuth } from "./provider-auth";

describe("provider auth resolver", () => {
  it("resolves env API keys without leaking raw secrets", () => {
    const resolved = resolveProviderAuth({
      provider: { id: "openai", apiKeyEnv: "OPENAI_API_KEY" },
      env: { OPENAI_API_KEY: "sk-test-secret-1234" }
    });

    expect(resolved.view).toMatchObject({
      providerId: "openai",
      status: "configured",
      source: "env",
      redacted: { OPENAI_API_KEY: "sk-...1234" }
    });
    expect(resolved.material.apiKey).toBe("sk-test-secret-1234");
    expect(JSON.stringify(resolved.view)).not.toContain("secret");
  });

  it("reports missing env credentials", () => {
    const resolved = resolveProviderAuth({
      provider: { id: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" },
      env: {}
    });

    expect(resolved.view.status).toBe("missing");
    expect(resolved.view.redacted.ANTHROPIC_API_KEY).toBe("<missing>");
    expect(resolved.view.diagnostics).toContainEqual(expect.objectContaining({
      code: "PROVIDER_AUTH_MISSING_ENV"
    }));
    expect(resolved.material.apiKey).toBeUndefined();
  });

  it("allows static API keys but marks the diagnostics as risky", () => {
    const resolved = resolveProviderAuth({
      provider: { id: "local", apiKey: "static-secret-5678" },
      env: {}
    });

    expect(resolved.view.status).toBe("configured");
    expect(resolved.view.source).toBe("static");
    expect(resolved.view.diagnostics).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "PROVIDER_AUTH_STATIC_SECRET"
    }));
    expect(JSON.stringify(resolved.view)).not.toContain("static-secret-5678");
  });

  it("reads local credential references from the configured credential root", async () => {
    const root = await mkdtemp(join(tmpdir(), "guga-provider-auth-"));
    mkdirSync(join(root, "credentials"), { recursive: true });
    writeFileSync(join(root, "credentials/openai.json"), JSON.stringify({ apiKey: "sk-local-secret-9999" }));

    const resolved = resolveProviderAuth({
      provider: { id: "openai", credentialRef: "credentials/openai.json" },
      credentialRoot: root,
      env: {}
    });

    expect(resolved.view).toMatchObject({
      status: "configured",
      source: "local",
      redacted: {
        credentialRef: "credentials/openai.json",
        apiKey: "sk-...9999"
      }
    });
    expect(resolved.material.apiKey).toBe("sk-local-secret-9999");
  });

  it("uses explicit unknown auth when no local source is configured", () => {
    const resolved = resolveProviderAuth({ provider: { id: "gateway" }, env: {} });

    expect(resolved.view.status).toBe("unknown");
    expect(resolved.view.source).toBe("none");
    expect(resolved.view.diagnostics).toContainEqual(expect.objectContaining({
      code: "PROVIDER_AUTH_UNKNOWN"
    }));
    expect(redactSecret("short")).toBe("<redacted>");
  });
});
