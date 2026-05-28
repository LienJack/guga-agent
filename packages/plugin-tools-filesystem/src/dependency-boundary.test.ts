import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("filesystem tool dependency boundary", () => {
  it("keeps compatibility package free to re-export core built-in filesystem helpers", async () => {
    const [pluginPackage, corePackage] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url))
    ]);

    expect(corePackage.dependencies).toMatchObject({
      "fast-glob": expect.any(String),
      ignore: expect.any(String)
    });
    expect(pluginPackage.dependencies).toHaveProperty("@guga-agent/core");
  });
});

async function readPackage(url: URL): Promise<{ dependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(url, "utf8")) as { dependencies?: Record<string, string> };
}
