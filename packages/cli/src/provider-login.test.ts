import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProviderCredentialStore } from "./provider-credential-store";
import { loginOAuthProvider, logoutProvider } from "./provider-login";

describe("provider login", () => {
  it("serializes OAuth login writes and logout deletes with the provider lock", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-provider-login-"));
    let releaseLogin: (() => void) | undefined;
    const loginMayFinish = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    let runnerStarted: (() => void) | undefined;
    const runnerDidStart = new Promise<void>((resolve) => {
      runnerStarted = resolve;
    });

    const login = loginOAuthProvider({
      providerId: "codex",
      env: { GUGA_HOME: gugaHome },
      runner: async ({ providerId, store }) => {
        runnerStarted?.();
        await loginMayFinish;
        return {
          ok: true,
          credential: store.saveCredential({
            providerId,
            kind: "oauth",
            accessToken: "codex-token",
            tokenType: "bearer"
          })
        };
      }
    });
    await runnerDidStart;

    const logout = logoutProvider({
      providerId: "codex",
      env: { GUGA_HOME: gugaHome }
    });
    releaseLogin?.();
    await login;
    await logout;

    const store = createProviderCredentialStore({ credentialsRoot: join(gugaHome, "credentials") });
    expect(store.readCredential("codex").status).toBe("missing");
  });
});
