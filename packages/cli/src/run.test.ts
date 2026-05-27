import { describe, expect, it } from "vitest";
import { readCliConfig } from "./config";
import { runCli } from "./commands/run";
import { renderHostEvent } from "./render/events";

describe("CLI run command", () => {
  it("runs with a mock provider and prints the final answer", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("mock: hello");
    expect(io.stderr()).toBe("");
  });

  it("prints structured events with --debug-events", async () => {
    const io = captureIo();

    await expect(runCli(["run", "hello", "--mock", "--debug-events"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("\"type\":\"run.started\"");
    expect(io.stdout()).toContain("\"type\":\"run.completed\"");
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
      baseURL: "http://localhost:11434/v1",
      apiKey: "test"
    });
  });
});

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: Object.assign((() => stdout.join("")), {
      write(chunk: string) {
        stdout.push(chunk);
      }
    }),
    stderr: Object.assign((() => stderr.join("")), {
      write(chunk: string) {
        stderr.push(chunk);
      }
    })
  };
}
