import { describe, expect, it } from "vitest";
import { createToolResultPreview } from "./tool-result-views";

describe("createToolResultPreview", () => {
  it("uses head and tail previews for execute-like tools", () => {
    const preview = createToolResultPreview({
      call: { id: "call-1", name: "shell_exec", input: {} },
      result: { ok: true, content: "unused" },
      content: `${"a".repeat(40)}ERROR${"z".repeat(40)}`,
      maxContentChars: 40,
      reference: { type: "buffer", id: "result-1" }
    });

    expect(preview.llmPreview).toContain("...[middle omitted]...");
    expect(preview.llmPreview).toContain("result-1");
    expect(preview.uiProjection).toContain("...[middle omitted]...");
    expect(preview.rereadInstruction).toContain("result-1");
  });

  it("uses match-oriented first lines for search tools", () => {
    const preview = createToolResultPreview({
      call: { id: "call-2", name: "fs_search", input: {} },
      result: { ok: true, content: "unused" },
      content: ["a.ts:1", "b.ts:2", "c.ts:3"].join("\n"),
      maxContentChars: 10
    });

    expect(preview.llmPreview).toContain("a.ts");
    expect(preview.llmPreview).not.toContain("c.ts");
  });

  it("keeps execute previews within very small budgets", () => {
    const preview = createToolResultPreview({
      call: { id: "call-small", name: "shell_exec", input: {} },
      result: { ok: true, content: "unused" },
      content: "0123456789",
      maxContentChars: 3
    });

    expect(preview.llmPreview.startsWith("012")).toBe(true);
    expect(preview.llmPreview).toContain("omitted");
    expect(preview.omitted).toBe(true);
  });
});
