import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createProviderCredentialStore,
  credentialPathForProvider,
  credentialRefForProvider,
  redactedCredentialView
} from "./provider-credential-store";

describe("provider credential store", () => {
  it("saves OAuth credentials atomically with redacted status", async () => {
    const root = await tempRoot();
    const store = createProviderCredentialStore({ credentialsRoot: root });

    const saved = store.saveCredential({
      providerId: "copilot",
      kind: "oauth",
      accessToken: "gho_super_secret_token",
      refreshToken: "refresh_super_secret_token",
      tokenType: "bearer",
      expiresAt: "2099-01-01T00:00:00.000Z",
      account: { login: "octo" },
      scopes: ["read:user"]
    });

    expect(saved.status).toBe("configured");
    expect(saved.providerId).toBe("copilot");
    expect(saved.redacted).toMatchObject({
      accessToken: "gho...oken",
      refreshToken: "ref...oken",
      account: "octo"
    });
    expect(JSON.stringify(saved)).not.toContain("super_secret");

    const file = credentialPathForProvider(root, "copilot");
    expect(file).toBe(join(root, "providers/copilot.json"));
    expect(readFileSync(file, "utf8")).toContain("gho_super_secret_token");
    if (process.platform !== "win32") {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("updates refresh state under a provider-scoped lock", async () => {
    const root = await tempRoot();
    const store = createProviderCredentialStore({ credentialsRoot: root, lockRetryDelayMs: 1 });
    store.saveCredential({
      providerId: "codex",
      kind: "oauth",
      accessToken: "first-token",
      refreshToken: "refresh-token",
      tokenType: "bearer"
    });

    const results = await Promise.all([
      store.withProviderLock("codex", () => {
        const current = store.readCredential("codex").credential;
        store.saveCredential({
          ...current!,
          accessToken: "second-token"
        });
        return "first-writer";
      }),
      store.withProviderLock("codex", () => {
        const current = store.readCredential("codex").credential;
        store.saveCredential({
          ...current!,
          accessToken: `${current!.accessToken}-third`
        });
        return "second-writer";
      })
    ]);

    expect(results.sort()).toEqual(["first-writer", "second-writer"]);
    expect(store.readCredential("codex").credential?.accessToken).toBe("second-token-third");
    expect(existsSync(join(root, "locks/codex.lock"))).toBe(false);
  });

  it("preserves the previous credential when a write fails before rename", async () => {
    const root = await tempRoot();
    const store = createProviderCredentialStore({ credentialsRoot: root });
    store.saveCredential({
      providerId: "copilot",
      kind: "oauth",
      accessToken: "good-token",
      tokenType: "bearer"
    });

    expect(() => store.saveCredential({
      providerId: "copilot/bad",
      kind: "oauth",
      accessToken: "bad-token",
      tokenType: "bearer"
    })).toThrow(/Invalid provider id/);

    expect(store.readCredential("copilot").credential?.accessToken).toBe("good-token");
  });

  it("returns invalid redacted state for malformed credential files", async () => {
    const root = await tempRoot();
    const store = createProviderCredentialStore({ credentialsRoot: root });
    store.saveCredential({
      providerId: "copilot",
      kind: "oauth",
      accessToken: "good-token",
      tokenType: "bearer"
    });
    const file = credentialPathForProvider(root, "copilot");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(file, "{not json", { mode: 0o600 }));

    const status = store.readCredential("copilot");

    expect(status.status).toBe("invalid");
    expect(status.credential).toBeUndefined();
    expect(JSON.stringify(status.view)).not.toContain("good-token");
  });

  it("removes only the selected provider credential on logout", async () => {
    const root = await tempRoot();
    const store = createProviderCredentialStore({ credentialsRoot: root });
    store.saveCredential({ providerId: "copilot", kind: "oauth", accessToken: "copilot-token", tokenType: "bearer" });
    store.saveCredential({ providerId: "codex", kind: "oauth", accessToken: "codex-token", tokenType: "bearer" });

    const loggedOut = store.deleteCredential("codex");

    expect(loggedOut.status).toBe("logged-out");
    expect(store.readCredential("codex").status).toBe("missing");
    expect(store.readCredential("copilot").status).toBe("configured");
  });

  it("uses stable config credential refs", async () => {
    const root = await tempRoot();

    expect(credentialRefForProvider("openai")).toBe("credentials/providers/openai.json");
    expect(credentialPathForProvider(root, "openai")).toBe(join(root, "providers/openai.json"));
    expect(redactedCredentialView({
      providerId: "codex",
      kind: "oauth",
      accessToken: "token-123456789",
      tokenType: "bearer"
    }).redacted.accessToken).toBe("tok...6789");
  });
});

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "guga-provider-credentials-"));
}
