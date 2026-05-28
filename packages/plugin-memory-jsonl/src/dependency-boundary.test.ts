import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("memory jsonl dependency boundary", () => {
  it("keeps persistence outside core and avoids docs/task imports", async () => {
    const [pluginPackage, corePackage, sourceFiles] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url)),
      readSourceFiles()
    ]);

    expect(pluginPackage.dependencies).toEqual({
      "@guga-agent/core": "workspace:*",
      "@guga-agent/plugin-memory-candidates": "workspace:*"
    });
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("@guga-agent/plugin-memory-jsonl");
    expect(sourceFiles).not.toContain(".trellis/");
    expect(sourceFiles).not.toContain("docs/");
    expect(sourceFiles).not.toContain("/dist/");
  });
});

async function readPackage(url: URL): Promise<{ dependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(url, "utf8")) as { dependencies?: Record<string, string> };
}

async function readSourceFiles(): Promise<string> {
  const files = [
    "index.ts",
    "jsonl-memory-store.ts",
    "memory-jsonl-plugin.ts"
  ];
  return (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
}
