import { describe, expect, it } from "vitest";
import { PassThrough, Readable } from "node:stream";
import { runCli } from "../commands/run";

describe("Ink workbench smoke route", () => {
  it("starts the bare mock workbench through the CLI route and exits cleanly", async () => {
    const io = captureIo({ stdin: ttyReadable("/exit\n"), tty: true });

    await expect(runCli(["--mock"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("Guga Ink workbench");
    expect(io.stdout()).toContain("Welcome to Guga");
    expect(io.stdout()).toContain("prompt");
    expect(io.stderr()).toBe("");
  });

  it("exits terminal mode on Ctrl+C through the CLI route", async () => {
    const io = captureIo({ stdin: ttyReadable("\u0003"), tty: true });

    await expect(runCli(["--mock"], io)).resolves.toBe(0);

    expect(io.stdout()).toContain("Guga Ink workbench");
    expect(io.stderr()).toBe("");
  });

  it("keeps non-TTY interactive smoke on friendly guidance", async () => {
    const io = captureIo({ stdin: Readable.from(["/exit\n"]) });

    await expect(runCli(["interactive", "--mock"], io)).resolves.toBe(2);

    expect(io.stderr()).toContain("guga interactive workbench requires a TTY");
    expect(io.stdout()).not.toContain("Guga Ink workbench");
  });
});

function captureIo(options: { env?: NodeJS.ProcessEnv; stdin?: NodeJS.ReadableStream; tty?: boolean } = {}) {
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
    ...(options.env ? { env: options.env } : {})
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
