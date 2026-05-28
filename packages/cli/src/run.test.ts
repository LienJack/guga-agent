import { describe, expect, it } from "vitest";
import { readCliConfigWithSources } from "./config";
import { runCli } from "./commands/run";
import type { ProviderOAuthLoginRunner } from "./provider-login";
import { renderHostEvent } from "./render/events";
import { PassThrough, Readable } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("CLI run command", () => {
  it("runs with a mock provider and prints the final answer", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("mock: hello");
    expect(io.stderr()).toBe("");
  });

  it("runs -p as a headless alias", async () => {
    const io = captureIo();

    await expect(runCli(["-p", "hello", "--mock"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("mock: hello");
    expect(io.stdout()).not.toContain("Guga Ink workbench");
    expect(io.stderr()).toBe("");
  });

  it("starts the bare Ink workbench launcher", async () => {
    const io = captureIo({ stdin: ttyReadable("/exit\n"), tty: true });

    await expect(runCli(["--mock"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("Guga Ink workbench");
    expect(io.stdout()).toContain("profile code");
    expect(io.stderr()).toBe("");
  });

  it("starts chat and interactive aliases through the Ink workbench launcher", async () => {
    for (const command of ["chat", "interactive"]) {
      const io = captureIo({ stdin: ttyReadable("/exit\n"), tty: true });

      await expect(runCli([command, "--mock"], io)).resolves.toBe(0);

      expect(io.stdout()).toContain("Guga Ink workbench");
      expect(io.stdout()).toContain("profile code");
      expect(io.stderr()).toBe("");
    }
  });

  it("rejects bare interactive mode without a TTY", async () => {
    const io = captureIo({ stdin: Readable.from(["/exit\n"]) });

    await expect(runCli(["--mock"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("guga interactive workbench requires a TTY");
  });

  it("rejects chat and interactive aliases without a TTY", async () => {
    for (const command of ["chat", "interactive"]) {
      const io = captureIo({ stdin: Readable.from(["/exit\n"]) });

      await expect(runCli([command, "--mock"], io)).resolves.toBe(2);

      expect(io.stderr()).toContain("guga interactive workbench requires a TTY");
    }
  });

  it("prints a friendly error when headless run has no configured model", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const io = captureIo({ env: { GUGA_HOME: gugaHome } });

    await expect(runCli(["run", "hello"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("No model configured. Run `guga init --model <id>`");
    expect(io.stderr()).not.toContain("CliHostFactoryError");
  });

  it("prints a friendly error when interactive mode has no configured model", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const io = captureIo({ stdin: ttyReadable("/exit\n"), tty: true, env: { GUGA_HOME: gugaHome } });

    await expect(runCli([], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("No model configured. Run `guga init --model <id>`");
    expect(io.stderr()).not.toContain("CliHostFactoryError");
  });

  it("initializes local CLI config for first real-provider use", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const io = captureIo({ env: { GUGA_HOME: gugaHome } });

    await expect(runCli(["init", "--model", "gpt-test"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain(`Created Guga config: ${join(realpathSync.native(gugaHome), "config.toml")}`);
    expect(io.stdout()).toContain("model: gpt-test");
    expect(io.stderr()).toBe("");
  });

  it("lists configured models", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const io = captureIo({
      env: {
        GUGA_HOME: gugaHome,
        GUGA_MODEL: "gpt-test"
      }
    });

    await expect(runCli(["--list-models"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("* gpt-test -> gpt-test");
    expect(io.stderr()).toBe("");
  });

  it("logs in a provider with a managed local credential reference", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const io = captureIo({ env: { GUGA_HOME: gugaHome } });

    await expect(runCli(["login", "openai", "--api-key", "sk-login-secret-1234", "--model", "gpt-test"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("configured provider openai");
    expect(io.stdout()).not.toContain("sk-login-secret-1234");
    expect(io.stderr()).toBe("");
    const credential = readFileSync(join(gugaHome, "credentials/providers/openai.json"), "utf8");
    expect(credential).toContain("sk-login-secret-1234");
    const config = readCliConfigWithSources({ env: { GUGA_HOME: gugaHome }, cwd: process.cwd() }).config;
    expect(config.providers).toEqual([
      expect.objectContaining({
        id: "openai",
        mode: "openai",
        credentialRef: "credentials/providers/openai.json"
      })
    ]);
    expect(config.models).toEqual([
      expect.objectContaining({
        id: "openai",
        providerId: "openai",
        modelId: "gpt-test"
      })
    ]);
  });

  it("does not hang login when no credential material is supplied", async () => {
    const io = captureIo({ env: {} });

    await expect(runCli(["login", "openai"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("login requires --api-key or --api-key-env");
  });

  it("logs in an OAuth provider through an injected runner without leaking tokens", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const oauthLoginRunner: ProviderOAuthLoginRunner = async ({ providerId, store }) => {
      return {
        ok: true,
        credential: store.saveCredential({
          providerId,
          kind: "oauth",
          accessToken: "oauth-login-secret-1234",
          tokenType: "bearer",
          account: { login: "octo" }
        })
      };
    };
    const io = captureIo({ env: { GUGA_HOME: gugaHome }, oauthLoginRunner });

    await expect(runCli(["login", "copilot"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("logged in provider copilot");
    expect(io.stdout()).toContain("auth: configured");
    expect(io.stdout()).not.toContain("oauth-login-secret-1234");
    await expect(runCli(["auth", "status", "copilot"], io)).resolves.toBe(0);
    expect(io.stdout()).toContain("copilot: configured (oauth)");
    const config = readCliConfigWithSources({ env: { GUGA_HOME: gugaHome }, cwd: process.cwd() }).config;
    expect(config.providers).toContainEqual(expect.objectContaining({
      id: "copilot",
      metadata: { authType: "oauth" }
    }));
  });

  it("fails Copilot OAuth login clearly when no GitHub OAuth app client id is configured", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const io = captureIo({ env: { GUGA_HOME: gugaHome } });

    await expect(runCli(["login", "copilot"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("Copilot OAuth login requires GUGA_COPILOT_CLIENT_ID");
    expect(io.stderr()).not.toContain("token");
  });

  it("keeps Codex OAuth disabled by default until official third-party contract is confirmed", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const io = captureIo({ env: { GUGA_HOME: gugaHome } });

    await expect(runCli(["login", "codex"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("Codex OAuth browser/device endpoints are not enabled by default");
  });

  it("logs out an OAuth provider and status becomes missing", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    const oauthLoginRunner: ProviderOAuthLoginRunner = async ({ providerId, store }) => ({
      ok: true,
      credential: store.saveCredential({
        providerId,
        kind: "oauth",
        accessToken: "oauth-login-secret-1234",
        tokenType: "bearer"
      })
    });
    const io = captureIo({ env: { GUGA_HOME: gugaHome }, oauthLoginRunner });

    await expect(runCli(["login", "codex"], io)).resolves.toBe(0);
    await expect(runCli(["logout", "codex"], io)).resolves.toBe(0);
    await expect(runCli(["auth", "status", "codex"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("logged out provider codex");
    expect(io.stdout()).toContain("codex: missing (oauth)");
    expect(io.stdout()).not.toContain("oauth-login-secret-1234");
  });

  it("prints structured events with --debug-events", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock", "--debug-events"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("\"type\":\"run.started\"");
    expect(io.stdout()).toContain("\"type\":\"run.completed\"");
  });

  it("prints redacted operational status with --ops", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock", "--ops"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("operations: providers=1 operations=13 runs=1 totalTokens=3");
    expect(io.stdout()).toContain("guga-home:");
    expect(io.stdout()).toContain("storage: sessions=");
    expect(io.stdout()).not.toContain("test-secret");
    expect(io.stderr()).toBe("");
  });

  it("runs with the code profile and mock provider", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock", "--profile", "code"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("mock: hello");
    expect(io.stderr()).toBe("");
  });

  it("runs with the deep research profile and mock provider", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock", "--profile", "deep-research"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("mock: hello");
    expect(io.stderr()).toBe("");
  });

  it("runs with the review profile and mock provider", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock", "--profile", "review"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("mock: hello");
    expect(io.stderr()).toBe("");
  });

  it("rejects unknown profiles", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock", "--profile", "unknown"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("Unknown profile: unknown");
  });

  it("renders tool progress from host events", () => {
    expect(renderHostEvent({
      type: "tool.progress",
      seq: 1,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      callId: "call-1",
      name: "shell",
      message: "running tests",
      progress: 0.5
    })).toEqual(["tool shell progress 50%: running tests"]);
  });

  it("renders explicit reasoning deltas in headless event output", () => {
    expect(renderHostEvent({
      type: "message.reasoning_delta",
      seq: 1,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "reasoning-1",
      text: "checking tools"
    })).toEqual(["reasoning: checking tools"]);
  });

  it("reads real provider config from environment", async () => {
    const gugaHome = await mkdtemp(join(tmpdir(), "guga-cli-home-"));
    expect(readCliConfigWithSources({
      env: {
        GUGA_HOME: gugaHome,
        GUGA_PROVIDER: "ai-sdk",
        GUGA_PROVIDER_MODE: "openai-compatible",
        GUGA_MODEL: "local-model",
        GUGA_BASE_URL: "http://localhost:11434/v1",
        GUGA_API_KEY: "test"
      },
      cwd: process.cwd()
    }).config).toEqual({
      providerId: "ai-sdk",
      providerMode: "openai-compatible",
      modelId: "local-model",
      defaultModel: "local-model",
      baseURL: "http://localhost:11434/v1",
      apiKey: "test"
    });
  });
});

function captureIo(options: {
  env?: NodeJS.ProcessEnv;
  stdin?: NodeJS.ReadableStream;
  tty?: boolean;
  oauthLoginRunner?: ProviderOAuthLoginRunner;
} = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: Object.assign((() => stdout.join("")), {
      ...(options.tty ? { isTTY: true } : {}),
      columns: 100,
      rows: 30,
      on() {
        return this;
      },
      off() {
        return this;
      },
      write(chunk: string) {
        stdout.push(chunk);
      }
    }),
    stderr: Object.assign((() => stderr.join("")), {
      write(chunk: string) {
        stderr.push(chunk);
      }
    }),
    ...(options.stdin ? { stdin: options.stdin } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.oauthLoginRunner ? { oauthLoginRunner: options.oauthLoginRunner } : {})
  };
}

function ttyReadable(input: string): NodeJS.ReadableStream & { isTTY?: boolean; setRawMode(mode: boolean): void; ref(): void; unref(): void } {
  const stream = new PassThrough();
  const timer = setInterval(() => {
    if (stream.listenerCount("readable") === 0) {
      return;
    }
    clearInterval(timer);
    const characters = Array.from(input.replaceAll("\n", "\r"));
    characters.forEach((character, index) => {
      setTimeout(() => {
        stream.write(character);
        if (index === characters.length - 1) {
          stream.end();
        }
      }, index);
    });
  }, 0);
  return Object.assign(stream, {
    isTTY: true,
    setRawMode() {},
    ref() {},
    unref() {}
  });
}
