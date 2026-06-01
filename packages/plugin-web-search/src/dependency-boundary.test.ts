import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_SEARCH_TOOL_NAME,
  createBraveSearchBackend,
  createMockWebSearchBackend,
  createWebSearchPlugin,
  createWebSearchTool
} from "./index";

describe("plugin-web-search public boundary", () => {
  it("exports the stable factories and constants from the package entrypoint", () => {
    expect(WEB_SEARCH_TOOL_NAME).toBe("web_search");
    expect(createWebSearchPlugin).toBeTypeOf("function");
    expect(createWebSearchTool).toBeTypeOf("function");
    expect(createMockWebSearchBackend).toBeTypeOf("function");
    expect(createBraveSearchBackend).toBeTypeOf("function");
  });

  it("keeps provider SDK dependencies out of the package scaffold", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(Object.keys(manifest.dependencies ?? {})).toEqual([
      "@guga-agent/core",
      "@guga-agent/extension-sdk"
    ]);
  });
});
