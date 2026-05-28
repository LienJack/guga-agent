import { randomUUID } from "node:crypto";
import type {
  ProviderCredentialStore,
  RedactedProviderCredentialView,
  StoredProviderCredential
} from "./provider-credential-store";

export type ProviderOAuthLoginEvent =
  | { type: "started"; providerId: string; loginId: string }
  | {
      type: "device_code";
      providerId: string;
      loginId: string;
      verificationUri: string;
      userCode: string;
      expiresInSeconds: number;
      intervalSeconds: number;
    }
  | { type: "browser_url"; providerId: string; loginId: string; authUrl: string }
  | { type: "polling"; providerId: string; loginId: string; nextPollInSeconds: number }
  | { type: "manual_code_required"; providerId: string; loginId: string; authUrl: string }
  | { type: "completed"; providerId: string; loginId: string }
  | { type: "cancelled"; providerId: string; loginId: string }
  | { type: "failed"; providerId: string; loginId?: string; code: string; message: string };

export type ProviderOAuthLoginResult =
  | {
      ok: true;
      providerId: string;
      loginId: string;
      credential: RedactedProviderCredentialView;
    }
  | {
      ok: false;
      providerId: string;
      loginId?: string;
      error: {
        code: string;
        message: string;
      };
    };

export type CopilotDeviceCodeStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
};

export type CopilotDeviceTokenPollResult =
  | { type: "authorization_pending" }
  | { type: "slow_down"; intervalSeconds?: number }
  | { type: "expired_token" }
  | { type: "access_denied" }
  | { type: "success"; accessToken: string; refreshToken?: string; tokenType: string; expiresAt?: string; scopes?: string[]; account?: StoredProviderCredential["account"] };

export type CopilotDeviceOAuthTransport = {
  requestDeviceCode(request: { clientId: string; scopes: readonly string[] }): Promise<CopilotDeviceCodeStart>;
  pollDeviceToken(request: { clientId: string; deviceCode: string }): Promise<CopilotDeviceTokenPollResult>;
};

export type RunCopilotDeviceOAuthLoginOptions = {
  clientId: string;
  store: ProviderCredentialStore;
  transport: CopilotDeviceOAuthTransport;
  providerId?: "copilot";
  scopes?: readonly string[];
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  onEvent?: (event: ProviderOAuthLoginEvent) => void;
};

export type CodexBrowserLoginStart = {
  loginId: string;
  authUrl: string;
  state: string;
};

export type CodexBrowserCallbackResult =
  | { code: string; state: string }
  | { type: "unavailable" }
  | { type: "cancelled" };

export type CodexBrowserTokenResult = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: string;
  account?: StoredProviderCredential["account"];
  scopes?: string[];
};

export type CodexBrowserOAuthTransport = {
  startBrowserLogin(): Promise<CodexBrowserLoginStart>;
  waitForCallback(request: { loginId: string; state: string; signal?: AbortSignal }): Promise<CodexBrowserCallbackResult>;
  exchangeCode(request: { loginId: string; code: string; state: string }): Promise<CodexBrowserTokenResult>;
};

export type RunCodexBrowserOAuthLoginOptions = {
  store: ProviderCredentialStore;
  transport: CodexBrowserOAuthTransport;
  providerId?: "codex";
  manualCode?: string;
  signal?: AbortSignal;
  onEvent?: (event: ProviderOAuthLoginEvent) => void;
};

export async function runCopilotDeviceOAuthLogin(
  options: RunCopilotDeviceOAuthLoginOptions
): Promise<ProviderOAuthLoginResult> {
  const providerId = options.providerId ?? "copilot";
  const sleep = options.sleep ?? defaultSleep;
  const start = await options.transport.requestDeviceCode({
    clientId: options.clientId,
    scopes: options.scopes ?? []
  });
  const loginId = randomUUID();
  emit(options, { type: "started", providerId, loginId });
  emit(options, {
    type: "device_code",
    providerId,
    loginId,
    verificationUri: start.verificationUri,
    userCode: start.userCode,
    expiresInSeconds: start.expiresInSeconds,
    intervalSeconds: start.intervalSeconds
  });

  let intervalSeconds = start.intervalSeconds;
  while (true) {
    if (options.signal?.aborted) {
      emit(options, { type: "cancelled", providerId, loginId });
      return failed(providerId, loginId, "cancelled", "OAuth login was cancelled.");
    }
    emit(options, { type: "polling", providerId, loginId, nextPollInSeconds: intervalSeconds });
    const poll = await options.transport.pollDeviceToken({ clientId: options.clientId, deviceCode: start.deviceCode });
    if (poll.type === "success") {
      const credential = options.store.saveCredential({
        providerId,
        kind: "oauth",
        accessToken: poll.accessToken,
        ...(poll.refreshToken ? { refreshToken: poll.refreshToken } : {}),
        tokenType: poll.tokenType,
        ...(poll.expiresAt ? { expiresAt: poll.expiresAt } : {}),
        ...(poll.account ? { account: poll.account } : {}),
        ...(poll.scopes ? { scopes: poll.scopes } : {})
      });
      emit(options, { type: "completed", providerId, loginId });
      return { ok: true, providerId, loginId, credential };
    }
    if (poll.type === "authorization_pending") {
      await sleep(intervalSeconds * 1_000);
      continue;
    }
    if (poll.type === "slow_down") {
      intervalSeconds = poll.intervalSeconds ?? intervalSeconds + 5;
      await sleep(intervalSeconds * 1_000);
      continue;
    }
    emit(options, { type: "failed", providerId, loginId, code: poll.type, message: messageForDeviceError(poll.type) });
    return failed(providerId, loginId, poll.type, messageForDeviceError(poll.type));
  }
}

export async function runCodexBrowserOAuthLogin(
  options: RunCodexBrowserOAuthLoginOptions
): Promise<ProviderOAuthLoginResult> {
  const providerId = options.providerId ?? "codex";
  const start = await options.transport.startBrowserLogin();
  emit(options, { type: "started", providerId, loginId: start.loginId });
  emit(options, { type: "browser_url", providerId, loginId: start.loginId, authUrl: start.authUrl });

  const callback = await options.transport.waitForCallback({
    loginId: start.loginId,
    state: start.state,
    ...(options.signal ? { signal: options.signal } : {})
  });
  if ("type" in callback && callback.type === "cancelled") {
    emit(options, { type: "cancelled", providerId, loginId: start.loginId });
    return failed(providerId, start.loginId, "cancelled", "OAuth login was cancelled.");
  }

  let code: string;
  if ("type" in callback && callback.type === "unavailable") {
    if (!options.manualCode) {
      emit(options, { type: "manual_code_required", providerId, loginId: start.loginId, authUrl: start.authUrl });
      return failed(providerId, start.loginId, "manual_code_required", "Paste the Codex authorization code or redirect URL to continue.");
    }
    code = options.manualCode;
  } else {
    if (callback.state !== start.state) {
      emit(options, { type: "failed", providerId, loginId: start.loginId, code: "state_mismatch", message: "OAuth callback state did not match." });
      return failed(providerId, start.loginId, "state_mismatch", "OAuth callback state did not match.");
    }
    code = callback.code;
  }

  const token = await options.transport.exchangeCode({ loginId: start.loginId, code, state: start.state });
  const credential = options.store.saveCredential({
    providerId,
    kind: "oauth",
    accessToken: token.accessToken,
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
    tokenType: token.tokenType,
    ...(token.expiresAt ? { expiresAt: token.expiresAt } : {}),
    ...(token.account ? { account: token.account } : {}),
    ...(token.scopes ? { scopes: token.scopes } : {})
  });
  emit(options, { type: "completed", providerId, loginId: start.loginId });
  return { ok: true, providerId, loginId: start.loginId, credential };
}

function failed(providerId: string, loginId: string | undefined, code: string, message: string): ProviderOAuthLoginResult {
  return {
    ok: false,
    providerId,
    ...(loginId ? { loginId } : {}),
    error: { code, message }
  };
}

function emit(
  options: { onEvent?: (event: ProviderOAuthLoginEvent) => void },
  event: ProviderOAuthLoginEvent
): void {
  options.onEvent?.(event);
}

function messageForDeviceError(code: Exclude<CopilotDeviceTokenPollResult["type"], "success" | "authorization_pending" | "slow_down">): string {
  if (code === "expired_token") {
    return "The device code expired. Start login again.";
  }
  return "The user denied the device authorization.";
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
