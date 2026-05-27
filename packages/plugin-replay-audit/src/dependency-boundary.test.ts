import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("replay audit plugin dependency boundary", () => {
  it("uses only public core exports and avoids project metadata dependencies", async () => {
    const [pluginPackage, corePackage, sourceFiles] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url)),
      readSourceFiles()
    ]);

    expect(pluginPackage.dependencies).toEqual({ "@guga-agent/core": "workspace:*" });
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("@guga-agent/plugin-replay-audit");
    expect(sourceFiles).not.toContain(".trellis/");
    expect(sourceFiles).not.toContain("docs/");
    expect(sourceFiles).not.toContain("/dist/");
    expect(sourceFiles).not.toContain("../core/src/");
  });
});

async function readPackage(url: URL): Promise<{ dependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(url, "utf8")) as { dependencies?: Record<string, string> };
}

async function readSourceFiles(): Promise<string> {
  const files = [
    "index.ts",
    "replay-audit-plugin.ts",
    "conversation-view.ts",
    "model-input-view.ts",
    "audit-view.ts"
  ];
  return (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
}
