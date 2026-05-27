import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority, type ContextSourceDescriptor } from "../contracts/context";
import { truncateContextSources } from "./context-truncation";

describe("truncateContextSources", () => {
  it("snips old low-priority history and preserves protected pending sources", () => {
    const sources: ContextSourceDescriptor[] = [
      source("system", ContextSourceKind.SystemPrompt, 10, true),
      source("old-tool", ContextSourceKind.ToolResultPreview, 50, false),
      source("pending", ContextSourceKind.PendingTurn, 10, true)
    ];

    const result = truncateContextSources({ sources, targetTokenEstimate: 25 });

    expect(result.snipped.map((item) => item.id)).toEqual(["old-tool"]);
    expect(result.retained.map((item) => item.id)).toEqual(["system", "pending"]);
    expect(result.decisions[0]).toMatchObject({
      kind: "truncate",
      sourceIds: ["old-tool"]
    });
  });
});

function source(id: string, kind: ContextSourceKind, tokens: number, isProtected: boolean): ContextSourceDescriptor {
  return {
    id,
    kind,
    priority: isProtected ? ContextSourcePriority.Critical : ContextSourcePriority.Low,
    provenance: { origin: "core" },
    tokenEstimate: { status: "estimated", tokens },
    modelVisible: true,
    protected: isProtected
  };
}
