import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderCredentialStore } from "./provider-credential-store";
import {
  createCodexAppServerOAuthTransport,
  runCodexAppServerOAuthLogin,
  runCodexBrowserOAuthLogin,
  runCopilotDeviceOAuthLogin,
  type CodexAppServerJsonRpcClient,
  type CopilotDeviceOAuthTransport,
  type ProviderOAuthLoginEvent
} from "./provider-oauth";

type OAuthContractStatus = "official" | "technical-preview" | "compatibility-only";
type OAuthFlowKind = "device-code" | "browser-callback";

type ProviderOAuthContractFixture = {
  providerId: string;
  owner: "guga";
  status: OAuthContractStatus;
  flows: OAuthFlowKind[];
  runtimeBoundary: "host-session-to-provider-adapter";
  storesRawTokenInCore: false;
  dependency?: {
    packageName: string;
    requiredForContractValidation: false;
    status: OAuthContractStatus;
  };
};

const providerOAuthContracts: ProviderOAuthContractFixture[] = [
  {
    providerId: "github-copilot",
    owner: "guga",
    status: "technical-preview",
    flows: ["device-code"],
    runtimeBoundary: "host-session-to-provider-adapter",
    storesRawTokenInCore: false,
    dependency: {
      packageName: "@github/copilot-sdk",
      requiredForContractValidation: false,
      status: "technical-preview"
    }
  },
  {
    providerId: "openai-codex",
    owner: "guga",
    status: "compatibility-only",
    flows: ["browser-callback", "device-code"],
    runtimeBoundary: "host-session-to-provider-adapter",
    storesRawTokenInCore: false
  }
];

type DeviceCodeStart = {
  providerId: string;
  loginId: string;
  verificationUri: string;
  userCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
};

type DevicePollError = "authorization_pending" | "slow_down" | "expired_token" | "access_denied";

function validateDeviceCodeStart(start: DeviceCodeStart): string[] {
  const errors: string[] = [];
  if (!start.loginId) {
    errors.push("missing login id");
  }
  if (!start.verificationUri.startsWith("https://")) {
    errors.push("verification uri must be https");
  }
  if (!start.userCode.trim()) {
    errors.push("missing user code");
  }
  if (start.intervalSeconds <= 0) {
    errors.push("poll interval must be positive");
  }
  if (start.expiresInSeconds <= 0) {
    errors.push("expiry must be positive");
  }
  return errors;
}

function nextDevicePollDelaySeconds(previousInterval: number, error: DevicePollError): number | undefined {
  if (error === "authorization_pending") {
    return previousInterval;
  }
  if (error === "slow_down") {
    return previousInterval + 5;
  }
  return undefined;
}

function redactedOAuthSessionView(session: {
  providerId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}) {
  return {
    providerId: session.providerId,
    status: session.accessToken ? "configured" : "missing",
    source: "oauth",
    redacted: {
      accessToken: session.accessToken ? "<redacted>" : "<missing>",
      refreshToken: session.refreshToken ? "<redacted>" : "<missing>",
      ...(session.expiresAt ? { expiresAt: session.expiresAt } : {})
    }
  };
}

describe("provider OAuth contract fixtures", () => {
  it("keeps first-party OAuth sessions owned by Guga and outside core token shapes", () => {
    expect(providerOAuthContracts).toEqual([
      expect.objectContaining({
        providerId: "github-copilot",
        owner: "guga",
        status: "technical-preview",
        flows: ["device-code"],
        runtimeBoundary: "host-session-to-provider-adapter",
        storesRawTokenInCore: false
      }),
      expect.objectContaining({
        providerId: "openai-codex",
        owner: "guga",
        status: "compatibility-only",
        flows: ["browser-callback", "device-code"],
        runtimeBoundary: "host-session-to-provider-adapter",
        storesRawTokenInCore: false
      })
    ]);
  });

  it("does not require preview Copilot SDK dependency for contract validation", () => {
    const copilot = providerOAuthContracts.find((contract) => contract.providerId === "github-copilot");

    expect(copilot?.dependency).toEqual({
      packageName: "@github/copilot-sdk",
      requiredForContractValidation: false,
      status: "technical-preview"
    });
  });

  it("requires CLI-visible device code fields before polling", () => {
    expect(validateDeviceCodeStart({
      providerId: "github-copilot",
      loginId: "login-1",
      verificationUri: "https://github.com/login/device",
      userCode: "ABCD-1234",
      intervalSeconds: 5,
      expiresInSeconds: 900
    })).toEqual([]);

    expect(validateDeviceCodeStart({
      providerId: "github-copilot",
      loginId: "",
      verificationUri: "http://github.com/login/device",
      userCode: "",
      intervalSeconds: 0,
      expiresInSeconds: 0
    })).toEqual([
      "missing login id",
      "verification uri must be https",
      "missing user code",
      "poll interval must be positive",
      "expiry must be positive"
    ]);
  });

  it("models device polling as pending or terminal without network calls", () => {
    expect(nextDevicePollDelaySeconds(5, "authorization_pending")).toBe(5);
    expect(nextDevicePollDelaySeconds(5, "slow_down")).toBe(10);
    expect(nextDevicePollDelaySeconds(5, "expired_token")).toBeUndefined();
    expect(nextDevicePollDelaySeconds(5, "access_denied")).toBeUndefined();
  });

  it("redacts OAuth sessions without losing provider status", () => {
    const view = redactedOAuthSessionView({
      providerId: "openai-codex",
      accessToken: "access-token-value",
      refreshToken: "refresh-token-value",
      expiresAt: "2026-05-28T12:00:00.000Z"
    });

    expect(view).toEqual({
      providerId: "openai-codex",
      status: "configured",
      source: "oauth",
      redacted: {
        accessToken: "<redacted>",
        refreshToken: "<redacted>",
        expiresAt: "2026-05-28T12:00:00.000Z"
      }
    });
    expect(JSON.stringify(view)).not.toContain("access-token-value");
    expect(JSON.stringify(view)).not.toContain("refresh-token-value");
  });
});

describe("provider OAuth flow runners", () => {
  it("runs Copilot device flow and stores a redacted OAuth credential", async () => {
    const store = createProviderCredentialStore({ credentialsRoot: await tempCredentialsRoot() });
    const events: ProviderOAuthLoginEvent[] = [];

    const result = await runCopilotDeviceOAuthLogin({
      clientId: "client-id",
      store,
      transport: {
        async requestDeviceCode() {
          return {
            deviceCode: "device-1",
            userCode: "ABCD-1234",
            verificationUri: "https://github.com/login/device",
            expiresInSeconds: 900,
            intervalSeconds: 5
          };
        },
        async pollDeviceToken() {
          return {
            type: "success",
            accessToken: "gho-copilot-secret",
            tokenType: "bearer",
            scopes: ["read:user"],
            account: { login: "octo" }
          };
        }
      },
      sleep: async () => {},
      onEvent: (event) => events.push(event)
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: "copilot",
      credential: {
        status: "configured",
        redacted: {
          accessToken: "gho...cret",
          account: "octo"
        }
      }
    });
    expect(store.readCredential("copilot").credential?.accessToken).toBe("gho-copilot-secret");
    expect(events.map((event) => event.type)).toEqual(["started", "device_code", "polling", "completed"]);
    expect(JSON.stringify(result)).not.toContain("copilot-secret");
    expect(JSON.stringify(result)).not.toContain("device-1");
    expect(JSON.stringify(events)).not.toContain("device-1");
    expect(new Set(events.map((event) => event.loginId)).size).toBe(1);
  });

  it("respects Copilot slow_down polling and returns terminal expiry without storing credentials", async () => {
    const store = createProviderCredentialStore({ credentialsRoot: await tempCredentialsRoot() });
    const sleeps: number[] = [];
    const responses: Awaited<ReturnType<CopilotDeviceOAuthTransport["pollDeviceToken"]>>[] = [
      { type: "authorization_pending" },
      { type: "slow_down" },
      { type: "expired_token" }
    ];

    const result = await runCopilotDeviceOAuthLogin({
      clientId: "client-id",
      store,
      transport: {
        async requestDeviceCode() {
          return {
            deviceCode: "device-1",
            userCode: "ABCD-1234",
            verificationUri: "https://github.com/login/device",
            expiresInSeconds: 900,
            intervalSeconds: 5
          };
        },
        async pollDeviceToken() {
          return responses.shift() ?? { type: "expired_token" };
        }
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    });

    expect(result).toMatchObject({
      ok: false,
      providerId: "copilot",
      error: { code: "expired_token" }
    });
    expect(sleeps).toEqual([5_000, 10_000]);
    expect(store.readCredential("copilot").status).toBe("missing");
  });

  it("runs Codex browser callback flow and rejects state mismatches", async () => {
    const store = createProviderCredentialStore({ credentialsRoot: await tempCredentialsRoot() });

    const result = await runCodexBrowserOAuthLogin({
      store,
      transport: {
        async startBrowserLogin() {
          return {
            loginId: "login-1",
            authUrl: "https://auth.openai.com/oauth",
            state: "expected-state"
          };
        },
        async waitForCallback() {
          return { code: "callback-code", state: "expected-state" };
        },
        async exchangeCode() {
          return {
            accessToken: "codex-access-secret",
            refreshToken: "codex-refresh-secret",
            tokenType: "bearer",
            account: { email: "user@example.com" }
          };
        }
      }
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: "codex",
      credential: {
        status: "configured",
        redacted: {
          accessToken: "cod...cret",
          refreshToken: "cod...cret",
          account: "user@example.com"
        }
      }
    });

    const failed = await runCodexBrowserOAuthLogin({
      store,
      transport: {
        async startBrowserLogin() {
          return {
            loginId: "login-2",
            authUrl: "https://auth.openai.com/oauth",
            state: "expected-state"
          };
        },
        async waitForCallback() {
          return { code: "callback-code", state: "wrong-state" };
        },
        async exchangeCode() {
          throw new Error("must not exchange mismatched state");
        }
      }
    });

    expect(failed).toMatchObject({
      ok: false,
      error: { code: "state_mismatch" }
    });
    expect(store.readCredential("codex").credential?.accessToken).toBe("codex-access-secret");
  });

  it("falls back to manual Codex code exchange when local callback is unavailable", async () => {
    const store = createProviderCredentialStore({ credentialsRoot: await tempCredentialsRoot() });

    const result = await runCodexBrowserOAuthLogin({
      store,
      manualCode: "manual-code",
      transport: {
        async startBrowserLogin() {
          return {
            loginId: "login-1",
            authUrl: "https://auth.openai.com/oauth",
            state: "state"
          };
        },
        async waitForCallback() {
          return { type: "unavailable" };
        },
        async exchangeCode(request) {
          expect(request.code).toBe("manual-code");
          return {
            accessToken: "manual-codex-secret",
            tokenType: "bearer"
          };
        }
      }
    });

    expect(result.ok).toBe(true);
    expect(store.readCredential("codex").credential?.accessToken).toBe("manual-codex-secret");
  });

  it("adapts Codex app-server browser login/start into a stored session marker", async () => {
    const store = createProviderCredentialStore({ credentialsRoot: await tempCredentialsRoot() });
    const events: ProviderOAuthLoginEvent[] = [];
    const client = new FakeCodexAppServerClient([
      {
        method: "account/login/start",
        params: { type: "chatgpt" },
        result: { type: "chatgpt", loginId: "login-1", authUrl: "https://chatgpt.com/auth" }
      }
    ], [
      {
        method: "account/login/completed",
        params: { loginId: "login-1", success: true, error: null }
      },
      {
        method: "account/updated",
        params: { authMode: "chatgpt", planType: "plus", email: "user@example.com" }
      }
    ]);

    const result = await runCodexAppServerOAuthLogin({
      store,
      transport: createCodexAppServerOAuthTransport(client),
      onEvent: (event) => events.push(event)
    });

    expect(result).toMatchObject({
      ok: true,
      providerId: "codex",
      credential: {
        status: "configured",
        redacted: {
          session: "codex-app-server",
          authMode: "chatgpt",
          plan: "plus",
          account: "user@example.com"
        }
      }
    });
    expect(events.map((event) => event.type)).toEqual(["started", "browser_url", "completed"]);
    expect(store.readCredential("codex").credential).toMatchObject({
      kind: "oauth",
      status: "configured",
      sessionKind: "codex-app-server",
      authMode: "chatgpt",
      planType: "plus",
      account: { email: "user@example.com" }
    });
    expect(store.readCredential("codex").credential?.accessToken).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("accessToken");
  });

  it("adapts Codex app-server device-code login/start without requiring raw OAuth endpoints", async () => {
    const store = createProviderCredentialStore({ credentialsRoot: await tempCredentialsRoot() });
    const events: ProviderOAuthLoginEvent[] = [];
    const client = new FakeCodexAppServerClient([
      {
        method: "account/login/start",
        params: { type: "chatgptDeviceCode" },
        result: {
          type: "chatgptDeviceCode",
          loginId: "login-2",
          verificationUrl: "https://auth.openai.com/codex/device",
          userCode: "ABCD-1234"
        }
      }
    ], [
      {
        method: "account/login/completed",
        params: { loginId: "login-2", success: true, error: null }
      },
      {
        method: "account/updated",
        params: { authMode: "chatgpt", planType: "pro" }
      }
    ]);

    const result = await runCodexAppServerOAuthLogin({
      store,
      loginType: "chatgptDeviceCode",
      transport: createCodexAppServerOAuthTransport(client),
      onEvent: (event) => events.push(event)
    });

    expect(result.ok).toBe(true);
    expect(events).toContainEqual({
      type: "device_code",
      providerId: "codex",
      loginId: "login-2",
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "ABCD-1234"
    });
    expect(store.readCredential("codex").credential).toMatchObject({
      sessionKind: "codex-app-server",
      authMode: "chatgpt",
      planType: "pro"
    });
  });

  it("does not store a Codex app-server credential when login completion fails", async () => {
    const store = createProviderCredentialStore({ credentialsRoot: await tempCredentialsRoot() });
    const client = new FakeCodexAppServerClient([
      {
        method: "account/login/start",
        params: { type: "chatgpt" },
        result: { type: "chatgpt", loginId: "login-3", authUrl: "https://chatgpt.com/auth" }
      }
    ], [
      {
        method: "account/login/completed",
        params: { loginId: "login-3", success: false, error: "denied" }
      }
    ]);

    const result = await runCodexAppServerOAuthLogin({
      store,
      transport: createCodexAppServerOAuthTransport(client)
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "login_failed", message: "denied" }
    });
    expect(store.readCredential("codex").status).toBe("missing");
  });
});

async function tempCredentialsRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-provider-oauth-"));
  return join(root, "credentials");
}

type FakeRequest = {
  method: "account/login/start" | "account/login/cancel";
  params?: unknown;
  result: unknown;
};

type FakeNotification = {
  method: "account/login/completed" | "account/updated";
  params: unknown;
};

class FakeCodexAppServerClient implements CodexAppServerJsonRpcClient {
  readonly requests: FakeRequest[];
  readonly notifications: FakeNotification[];

  constructor(requests: FakeRequest[], notifications: FakeNotification[]) {
    this.requests = [...requests];
    this.notifications = [...notifications];
  }

  async request(method: FakeRequest["method"], params?: unknown): Promise<unknown> {
    const next = this.requests.shift();
    expect(next).toMatchObject({ method, ...(params === undefined ? {} : { params }) });
    return next?.result;
  }

  async waitForNotification(
    method: FakeNotification["method"],
    options?: { matches?: (params: unknown) => boolean }
  ): Promise<unknown> {
    const index = this.notifications.findIndex((notification) =>
      notification.method === method && (options?.matches?.(notification.params) ?? true)
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const [notification] = this.notifications.splice(index, 1);
    return notification?.params;
  }
}
