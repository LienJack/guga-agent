import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("dependency boundary", () => {
  it("does not import HTTP, CLI, Web, or desktop implementations", async () => {
    const files = [
      "src/host-runtime.ts",
      "src/event-projector.ts",
      "src/in-memory-run-store.ts"
    ];
    const contents = await Promise.all(files.map((file) => readFile(path.join(process.cwd(), file), "utf8")));

    expect(contents.join("\n")).not.toMatch(/node:http|commander|react|hono|express|tauri/i);
  });
});
