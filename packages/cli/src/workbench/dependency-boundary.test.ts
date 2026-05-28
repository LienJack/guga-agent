import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("workbench dependency boundary", () => {
  it("does not import terminal renderer packages", async () => {
    const workbenchDir = dirname(fileURLToPath(import.meta.url));
    const files = (await readdir(workbenchDir)).filter((file) => file.endsWith(".ts"));
    const forbiddenImport = "@open" + "tui/";
    const forbiddenBareImport = "@open" + "tui";

    for (const file of files) {
      const source = await readFile(join(workbenchDir, file), "utf8");

      expect(source).not.toContain(`from "${forbiddenBareImport}`);
      expect(source).not.toContain(`from '${forbiddenBareImport}`);
      expect(source).not.toContain(`from "${forbiddenImport}`);
      expect(source).not.toContain(`from '${forbiddenImport}`);
    }
  });
});
