import { describe, expect, it } from "vitest";
import { readCliConfig } from "./config";
import { runCli } from "./commands/run";
import { renderHostEvent } from "./render/events";
import { Readable } from "node:stream";

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

    expect(io.stderr()).toContain("No model configured. Set GUGA_MODEL");
    expect(io.stderr()).not.toContain("CliHostFactoryError");
  });

  it("prints a friendly error when interactive mode has no configured model", async () => {
    const io = captureIo({ stdin: ttyReadable("/exit\n"), tty: true, env: {} });

    await expect(runCli([], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("No model configured. Set GUGA_MODEL");
    expect(io.stderr()).not.toContain("CliHostFactoryError");
  });

  it("lists configured models", async () => {
    const io = captureIo({
      env: {
        GUGA_MODEL: "gpt-test"
      }
    });

    await expect(runCli(["--list-models"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("* gpt-test -> gpt-test");
    expect(io.stderr()).toBe("");
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
      type: "tool.started",
      seq: 1,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      callId: "call-1",
      name: "shell"
    })).toEqual(["tool shell started"]);
  });

  it("reads real provider config from environment", () => {
    expect(readCliConfig({
      GUGA_PROVIDER: "ai-sdk",
      GUGA_PROVIDER_MODE: "openai-compatible",
      GUGA_MODEL: "local-model",
      GUGA_BASE_URL: "http://localhost:11434/v1",
      GUGA_API_KEY: "test"
    })).toEqual({
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
