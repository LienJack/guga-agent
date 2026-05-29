import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installer = join(root, "scripts/install-cli-alias.mjs");

describe("install-cli-alias", () => {
  it("installs a shell function that delegates to pnpm dev:cli", () => {
    const temp = mkdtempSync(join(tmpdir(), "guga-install-cli-"));
    try {
      const shellRc = join(temp, ".customrc");

      execFileSync(process.execPath, [installer, "--shell-rc", shellRc], {
        cwd: root,
        encoding: "utf8"
      });

      const content = readFileSync(shellRc, "utf8");
      expect(content).toContain("# >>> guga-agent cli alias >>>");
      expect(content).toContain("guga() {");
      expect(content).toContain(`cd '${root.replaceAll("'", "'\\''")}' && pnpm run dev:cli "$@"`);
      expect(content).not.toContain("alias guga=");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("updates an existing managed block idempotently", () => {
    const temp = mkdtempSync(join(tmpdir(), "guga-install-cli-"));
    try {
      const shellRc = join(temp, ".customrc");

      execFileSync(process.execPath, [installer, "--shell-rc", shellRc], {
        cwd: root,
        encoding: "utf8"
      });
      execFileSync(process.execPath, [installer, "--shell-rc", shellRc], {
        cwd: root,
        encoding: "utf8"
      });

      const content = readFileSync(shellRc, "utf8");
      expect(content.match(/# >>> guga-agent cli alias >>>/g)).toHaveLength(1);
      expect(content.match(/guga\(\) \{/g)).toHaveLength(1);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
