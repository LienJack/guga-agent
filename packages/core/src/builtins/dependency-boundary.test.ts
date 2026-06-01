import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const KERNEL_FILES = [
  "contracts/plugins.ts",
  "registry/capability-registry.ts",
  "hooks/hook-kernel.ts",
  "permissions/permission-kernel.ts",
  "tools/execution-pipeline.ts"
];

const RUNTIME_BARREL_FILES = [
  "runtime/agent-runtime.ts",
  "runtime/create-agent-runtime.ts",
  "builtins/default-core-capabilities.ts",
  "index.ts"
];

describe("built-in dependency boundary", () => {
  it("keeps core kernel layers from importing built-in implementation modules", () => {
    for (const file of KERNEL_FILES) {
      const content = readFileSync(join("src", file), "utf8");

      expect(content).not.toMatch(/from\s+["'][^"']*builtins/);
      expect(content).not.toMatch(/from\s+["'][^"']*plugin-tools-/);
      expect(content).not.toMatch(/from\s+["'][^"']*provider-ai-sdk/);
    }
  });

  it("does not statically import optional AI SDK dependencies from runtime or root barrel", () => {
    for (const file of RUNTIME_BARREL_FILES) {
      const content = readFileSync(join("src", file), "utf8");

      expect(content).not.toMatch(/^import\s+(?!type\b).*from\s+["'][^"']*provider-ai-sdk/m);
      expect(content).not.toMatch(/^import\s+(?!type\b).*from\s+["']ai["']/m);
      expect(content).not.toMatch(/^import\s+(?!type\b).*from\s+["']@ai-sdk\//m);
    }
  });
});
