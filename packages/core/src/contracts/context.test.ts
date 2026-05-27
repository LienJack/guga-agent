import { describe, expect, it } from "vitest";
import {
  ContextSourceKind,
  ContextSourcePriority,
  type ContextPolicy,
  type ModelInputProjection
} from "./context";

describe("context contracts", () => {
  it("can express a model input projection envelope without replacing provider messages", () => {
    const projection: ModelInputProjection = {
      id: "projection-1",
      runId: "run-1",
      turn: 0,
      messages: [
        { role: "system", content: "You are Guga." },
        { role: "user", content: "Use the plan." },
        { role: "tool", toolCallId: "call-1", name: "read_file", content: "preview", isError: false }
      ],
      tools: [],
      sourceDescriptors: [
        {
          id: "system",
          kind: ContextSourceKind.SystemPrompt,
          priority: ContextSourcePriority.Critical,
          provenance: { origin: "core" },
          tokenEstimate: { status: "estimated", tokens: 4 },
          modelVisible: true,
          protected: true
        },
        {
          id: "tool-preview",
          kind: ContextSourceKind.ToolResultPreview,
          priority: ContextSourcePriority.High,
          provenance: { origin: "tool", toolCallId: "call-1" },
          tokenEstimate: { status: "estimated", tokens: 2 },
          references: [
            {
              type: "tool-result",
              id: "call-1",
              rereadInstruction: "Rerun or reread the tool result if full output is needed."
            }
          ],
          modelVisible: true
        }
      ],
      budget: {
        contextWindow: 16_000,
        reservedOutputTokens: 1_000,
        usableInputTokens: 15_000,
        estimatedInputTokens: 6,
        estimateStatus: "complete",
        warningThreshold: 0.7,
        compactThreshold: 0.85
      },
      pressure: {
        id: "pressure-1",
        level: "none",
        reason: "projection is within budget",
        budget: {
          contextWindow: 16_000,
          reservedOutputTokens: 1_000,
          usableInputTokens: 15_000,
          estimatedInputTokens: 6,
          estimateStatus: "complete",
          warningThreshold: 0.7,
          compactThreshold: 0.85
        },
        sourceIds: ["system", "tool-preview"]
      },
      policyDecisions: []
    };

    expect(projection.messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "call-1" });
    expect(projection.sourceDescriptors.at(1)?.references?.[0]?.rereadInstruction).toContain("full output");
  });

  it("can express an auditable context policy capability", () => {
    const policy: ContextPolicy = {
      id: "default-context",
      phases: ["context.assemble", "context.budget", "context.truncate"],
      auditIdentity: {
        pluginId: "plugin-context-default",
        packageName: "@guga-agent/plugin-context-default",
        label: "Default context policy"
      },
      permissionScope: "context-write"
    };

    expect(policy.phases).toContain("context.truncate");
    expect(policy.auditIdentity.pluginId).toBe("plugin-context-default");
  });
});
