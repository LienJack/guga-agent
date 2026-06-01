import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { safePathSegment } from "./guga-home";

export type ProviderAuthStatus =
  | "configured"
  | "missing"
  | "invalid"
  | "unknown"
  | "login-pending"
  | "expired"
  | "refresh-failed"
  | "logged-out";

export type StoredProviderCredentialKind = "api-key" | "oauth";

export type StoredProviderCredentialStatus = Extract<
  ProviderAuthStatus,
  "configured" | "login-pending" | "refresh-failed" | "logged-out"
>;

export type StoredProviderCredential = {
  version?: 1;
  providerId: string;
  kind: StoredProviderCredentialKind;
  status?: StoredProviderCredentialStatus;
  sessionKind?: "bearer" | "codex-app-server";
  authMode?: "chatgpt" | "apiKey";
  planType?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  refreshFailure?: {
    at: string;
    code?: string;
    message?: string;
  };
  account?: {
    id?: string;
    login?: string;
    email?: string;
  };
  scopes?: string[];
  updatedAt?: string;
};

export type RedactedProviderCredentialView = {
  providerId: string;
  kind?: StoredProviderCredentialKind;
  status: ProviderAuthStatus;
  redacted: Record<string, string>;
  accountHint?: string;
  expiresAt?: string;
  failureCode?: string;
};

export type ProviderCredentialReadResult = {
  providerId: string;
  status: ProviderAuthStatus;
  credential?: StoredProviderCredential;
  view: RedactedProviderCredentialView;
};

export type ProviderCredentialStore = {
  credentialsRoot: string;
  readCredential(providerId: string): ProviderCredentialReadResult;
  saveCredential(credential: StoredProviderCredential): RedactedProviderCredentialView;
  deleteCredential(providerId: string): RedactedProviderCredentialView;
  withProviderLock<T>(providerId: string, callback: () => T | Promise<T>): Promise<T>;
};

export type CreateProviderCredentialStoreOptions = {
  credentialsRoot: string;
  lockRetryDelayMs?: number;
  lockTimeoutMs?: number;
  now?: () => Date;
};

const DEFAULT_LOCK_RETRY_DELAY_MS = 25;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;

export function createProviderCredentialStore(
  options: CreateProviderCredentialStoreOptions
): ProviderCredentialStore {
  const retryDelayMs = options.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS;
  const timeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());

  return {
    credentialsRoot: options.credentialsRoot,
    readCredential(providerId) {
      assertProviderId(providerId);
      const path = credentialPathForProvider(options.credentialsRoot, providerId);
      if (!existsSync(path)) {
        return {
          providerId,
          status: "missing",
          view: { providerId, status: "missing", redacted: {} }
        };
      }
      try {
        const credential = JSON.parse(readFileSync(path, "utf8")) as StoredProviderCredential;
        if (!isStoredCredential(providerId, credential)) {
          return invalidReadResult(providerId);
        }
        const view = redactedCredentialView(credential, { now: now() });
        return {
          providerId,
          status: view.status,
          credential,
          view
        };
      } catch {
        return invalidReadResult(providerId);
      }
    },
    saveCredential(credential) {
      assertProviderId(credential.providerId);
      const path = credentialPathForProvider(options.credentialsRoot, credential.providerId);
      const stored: StoredProviderCredential = {
        version: 1,
        ...credential,
        updatedAt: now().toISOString()
      };
      writeJsonAtomic(path, stored);
      return redactedCredentialView(stored, { now: now() });
    },
    deleteCredential(providerId) {
      assertProviderId(providerId);
      const path = credentialPathForProvider(options.credentialsRoot, providerId);
      if (existsSync(path)) {
        rmSync(path);
      }
      return {
        providerId,
        status: "logged-out",
        redacted: {}
      };
    },
    async withProviderLock(providerId, callback) {
      assertProviderId(providerId);
      const lockPath = join(options.credentialsRoot, "locks", `${safePathSegment(providerId)}.lock`);
      mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
      const started = Date.now();
      while (true) {
        try {
          mkdirSync(lockPath, { recursive: false, mode: 0o700 });
          break;
        } catch (error) {
          if (Date.now() - started >= timeoutMs) {
            throw new Error(`Timed out waiting for provider credential lock: ${providerId}`);
          }
          await sleep(retryDelayMs);
        }
      }
      try {
        return await callback();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    }
  };
}

export function credentialRefForProvider(providerId: string): string {
  assertProviderId(providerId);
  return join("credentials", "providers", `${safePathSegment(providerId)}.json`);
}

export function credentialPathForProvider(credentialsRoot: string, providerId: string): string {
  assertProviderId(providerId);
  return join(credentialsRoot, "providers", `${safePathSegment(providerId)}.json`);
}

export function redactedCredentialView(
  credential: StoredProviderCredential,
  options: { now?: Date } = {}
): RedactedProviderCredentialView {
  const now = options.now ?? new Date();
  const status = credentialStatus(credential, now);
  const redacted: Record<string, string> = {};
  if (credential.apiKey) {
    redacted.apiKey = redactCredentialSecret(credential.apiKey);
  }
  if (credential.accessToken) {
    redacted.accessToken = redactCredentialSecret(credential.accessToken);
  }
  if (credential.refreshToken) {
    redacted.refreshToken = redactCredentialSecret(credential.refreshToken);
  }
  if (credential.sessionKind) {
    redacted.session = credential.sessionKind;
  }
  if (credential.authMode) {
    redacted.authMode = credential.authMode;
  }
  if (credential.planType) {
    redacted.plan = credential.planType;
  }
  const accountHint = accountHintFor(credential.account);
  if (accountHint) {
    redacted.account = accountHint;
  }
  return {
    providerId: credential.providerId,
    kind: credential.kind,
    status,
    redacted,
    ...(accountHint ? { accountHint } : {}),
    ...(credential.expiresAt ? { expiresAt: credential.expiresAt } : {}),
    ...(credential.refreshFailure?.code ? { failureCode: credential.refreshFailure.code } : {})
  };
}

function credentialStatus(credential: StoredProviderCredential, now: Date): ProviderAuthStatus {
  if (credential.status === "logged-out") {
    return "logged-out";
  }
  if (credential.status === "login-pending") {
    return "login-pending";
  }
  if (credential.status === "refresh-failed" || credential.refreshFailure) {
    return "refresh-failed";
  }
  if (credential.expiresAt && Date.parse(credential.expiresAt) <= now.getTime()) {
    return "expired";
  }
  if (credential.kind === "api-key" && credential.apiKey) {
    return "configured";
  }
  if (credential.kind === "oauth" && credential.accessToken) {
    return "configured";
  }
  if (
    credential.kind === "oauth"
    && credential.status === "configured"
    && credential.sessionKind === "codex-app-server"
    && credential.authMode === "chatgpt"
  ) {
    return "configured";
  }
  return "invalid";
}

function accountHintFor(account: StoredProviderCredential["account"]): string | undefined {
  return account?.login ?? account?.email ?? account?.id;
}

function redactCredentialSecret(value: string | undefined): string {
  if (!value) {
    return "<missing>";
  }
  if (value.length <= 8) {
    return "<redacted>";
  }
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

function invalidReadResult(providerId: string): ProviderCredentialReadResult {
  return {
    providerId,
    status: "invalid",
    view: {
      providerId,
      status: "invalid",
      redacted: {}
    }
  };
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(tempPath, path);
    if (process.platform !== "win32") {
      const mode = statSync(path).mode & 0o777;
      if (mode !== 0o600) {
        writeFileSync(path, readFileSync(path), { mode: 0o600 });
      }
    }
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function isStoredCredential(providerId: string, value: StoredProviderCredential): value is StoredProviderCredential {
  return typeof value === "object"
    && value !== null
    && value.providerId === providerId
    && (value.kind === "api-key" || value.kind === "oauth");
}

function assertProviderId(providerId: string): void {
  if (!providerId || safePathSegment(providerId) !== providerId) {
    throw new Error(`Invalid provider id for credential storage: ${providerId}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
