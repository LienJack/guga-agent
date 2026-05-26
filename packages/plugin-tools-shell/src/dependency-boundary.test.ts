import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("shell tool dependency boundary", () => {
  it("does not move shell backend dependencies into core", async () => {
    const [pluginPackage, corePackage] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url))
    ]);

    expect(pluginPackage.dependencies).toMatchObject({
      "@guga-agent/core": "workspace:*"
    });
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("execa");
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("nano-spawn");
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("strip-ansi");
  });
});

async function readPackage(url: URL): Promise<{ dependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(url, "utf8")) as { dependencies?: Record<string, string> };
}
