import { describe, expect, it } from "vitest";
import { ContextSourceKind } from "../contracts/context";
import { ModelInputProjector } from "./model-input-projection";

describe("ModelInputProjector", () => {
  it("assembles provider-visible messages and source metadata into one projection", () => {
    const projector = new ModelInputProjector({ idFactory: () => "test" });
    const projection = projector.assemble({
      runId: "run-1",
      turn: 0,
      messages: [
        { role: "system", content: "You are Guga." },
        { role: "user", content: "Read the file" },
        {
          role: "assistant",
          toolCalls: [{ id: "call-1", name: "read_file", input: { path: "README.md" } }]
        },
        { role: "tool", toolCallId: "call-1", name: "read_file", content: "README preview", isError: false },
        { role: "user", content: "Continue" }
      ],
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          inputSchema: { type: "object" },
          effect: "read",
          execute() {
            return { ok: true, content: "unused" };
          }
        }
      ],
      model: {
        providerId: "mock",
        modelId: "mock-model",
        metadata: { providerId: "mock", modelId: "mock-model", contextWindow: 100, maxOutputTokens: 10 }
      }
    });

    expect(projection.id).toBe("projection-test");
    expect(projection.messages).toHaveLength(5);
    expect(projection.tools.map((tool) => tool.name)).toEqual(["read_file"]);
    expect(projection.sourceDescriptors.map((source) => source.kind)).toContain(ContextSourceKind.PendingTurn);
    expect(projection.sourceDescriptors).toContainEqual(expect.objectContaining({
      kind: ContextSourceKind.ToolResultPreview,
      provenance: expect.objectContaining({ toolCallId: "call-1" })
    }));
    expect(projection.budget.usableInputTokens).toBe(90);
  });

  it("marks the estimate as partial when model context window is unknown", () => {
    const projector = new ModelInputProjector({ idFactory: () => "unknown" });
    const projection = projector.assemble({
      runId: "run-unknown",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: []
    });

    expect(projection.budget.estimateStatus).toBe("partial");
    expect(projection.pressure.level).toBe("none");
    expect(projection.pressure.reason).toContain("unknown");
  });
});
