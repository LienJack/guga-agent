import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { redactSecret, resolveProviderAuth } from "./provider-auth";
import { createProviderCredentialStore } from "./provider-credential-store";

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

  it("resolves OAuth credentials from Guga Home without leaking tokens", async () => {
    const root = await mkdtemp(join(tmpdir(), "guga-provider-auth-"));
    const store = createProviderCredentialStore({ credentialsRoot: join(root, "credentials") });
    store.saveCredential({
      providerId: "copilot",
      kind: "oauth",
      accessToken: "gho-oauth-secret-1234",
      refreshToken: "refresh-oauth-secret-9999",
      tokenType: "bearer",
      account: { login: "octo" },
      expiresAt: "2099-01-01T00:00:00.000Z"
    });

    const resolved = resolveProviderAuth({
      provider: { id: "copilot", metadata: { authType: "oauth" } },
      credentialRoot: root,
      env: {}
    });

    expect(resolved.view).toMatchObject({
      providerId: "copilot",
      status: "configured",
      source: "oauth",
      redacted: {
        accessToken: "gho...1234",
        refreshToken: "ref...9999",
        account: "octo"
      }
    });
    expect(resolved.material).toMatchObject({
      providerId: "copilot",
      accessToken: "gho-oauth-secret-1234",
      refreshToken: "refresh-oauth-secret-9999",
      tokenType: "bearer"
    });
    expect(JSON.stringify(resolved.view)).not.toContain("oauth-secret");
  });

  it("reports expired and malformed OAuth credentials without exposing raw payloads", async () => {
    const root = await mkdtemp(join(tmpdir(), "guga-provider-auth-"));
    const store = createProviderCredentialStore({ credentialsRoot: join(root, "credentials") });
    store.saveCredential({
      providerId: "codex",
      kind: "oauth",
      accessToken: "expired-secret-token",
      tokenType: "bearer",
      expiresAt: "2000-01-01T00:00:00.000Z"
    });

    const expired = resolveProviderAuth({
      provider: { id: "codex", metadata: { authType: "oauth" } },
      credentialRoot: root,
      env: {}
    });

    expect(expired.view.status).toBe("expired");
    expect(expired.view.diagnostics).toContainEqual(expect.objectContaining({
      code: "PROVIDER_AUTH_EXPIRED_OAUTH"
    }));
    expect(expired.material.accessToken).toBeUndefined();
    expect(JSON.stringify(expired.view)).not.toContain("expired-secret-token");
  });
});
