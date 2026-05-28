import { describe, expect, it } from "vitest";
import { readCliConfigWithSources } from "./config";
import { runCli } from "./commands/run";
import { renderHostEvent } from "./render/events";
import { Readable } from "node:stream";
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
    expect(io.stderr()).toBe("");
  });

  it("starts the bare workbench launcher", async () => {
    const io = captureIo({ stdin: ttyReadable("/exit\n"), tty: true });

    await expect(runCli(["--mock"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("Guga CLI interactive mode");
    expect(io.stdout()).toContain("profile: code");
    expect(io.stderr()).toBe("");
  });

  it("rejects bare interactive mode without a TTY", async () => {
    const io = captureIo({ stdin: Readable.from(["/exit\n"]) });

    await expect(runCli(["--mock"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("guga interactive workbench requires a TTY");
  });

  it("prints a friendly error when headless run has no configured model", async () => {
    const io = captureIo({ env: {} });

    await expect(runCli(["run", "hello"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("No model configured. Run `guga init --model <id>`");
    expect(io.stderr()).not.toContain("CliHostFactoryError");
  });

  it("prints a friendly error when interactive mode has no configured model", async () => {
    const io = captureIo({ stdin: ttyReadable("/exit\n"), tty: true, env: {} });

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

function captureIo(options: { env?: NodeJS.ProcessEnv; stdin?: NodeJS.ReadableStream; tty?: boolean } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: Object.assign((() => stdout.join("")), {
      ...(options.tty ? { isTTY: true } : {}),
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
    ...(options.env ? { env: options.env } : {})
  };
}

function ttyReadable(input: string): NodeJS.ReadableStream & { isTTY?: boolean } {
  return Object.assign(Readable.from([input]), { isTTY: true });
}
