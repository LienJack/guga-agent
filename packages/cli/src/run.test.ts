import { describe, expect, it } from "vitest";
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
