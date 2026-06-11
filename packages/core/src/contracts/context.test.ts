import { describe, expect, it } from "vitest";
import {
  ContextSourceKind,
  ContextSourcePriority,
  type ContextPolicy,
  type MemoryCandidateMetadata,
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

  it("can distinguish state, trace, and memory-candidate sources from provider-visible messages", () => {
    const memoryMetadata: MemoryCandidateMetadata = {
      ontology: ContextSourceKind.MemoryCandidate,
      sensitivity: "sensitive",
      confidence: "medium",
      scope: "session",
      intendedUsage: ["memory-review", "audit"],
      candidates: [{
        candidateId: "candidate-1",
        sensitivity: "sensitive",
        confidence: "medium",
        scope: "session",
        intendedUsage: ["memory-review"],
        sourceRefs: [{ type: "message", id: "message-1", label: "user turn" }],
        rawCandidateTextIncluded: false
      }]
    };
    const projection: ModelInputProjection = {
      id: "projection-attention",
      runId: "run-attention",
      turn: 1,
      messages: [{ role: "user", content: "Continue the current implementation." }],
      tools: [],
      sourceDescriptors: [
        {
          id: "state-current-objective",
          kind: ContextSourceKind.StateProjection,
          priority: ContextSourcePriority.High,
          provenance: { origin: "core" },
          tokenEstimate: { status: "estimated", tokens: 4 },
          references: [{ type: "message", id: "message-0", label: "current objective" }],
          modelVisible: true,
          metadata: {
            ontology: ContextSourceKind.StateProjection,
            sensitivity: "internal",
            confidence: "high",
            scope: "run",
            intendedUsage: ["provider-input", "compaction-continuity", "audit"],
            generatedFromSourceIds: ["message-0"],
            items: [{
              kind: "objective",
              label: "current objective",
              sensitivity: "internal",
              confidence: "high",
              scope: "run",
              intendedUsage: ["compaction-continuity"],
              sourceRefs: [{ type: "message", id: "message-0" }]
            }]
          }
        },
        {
          id: "trace-policy-decision",
          kind: ContextSourceKind.AccountableTrace,
          priority: ContextSourcePriority.Medium,
          provenance: { origin: "core" },
          tokenEstimate: { status: "estimated", tokens: 3 },
          references: [{ type: "host-reference", id: "decision-1", label: "policy decision" }],
          modelVisible: false,
          metadata: {
            ontology: ContextSourceKind.AccountableTrace,
            sensitivity: "internal",
            confidence: "medium",
            scope: "run",
            intendedUsage: ["audit", "replay"],
            generatedFromDecisionIds: ["decision-1"],
            generatedFromSourceIds: [],
            items: [{
              kind: "decision",
              label: "policy decision",
              sensitivity: "internal",
              confidence: "medium",
              scope: "run",
              intendedUsage: ["audit"],
              sourceRefs: [{ type: "host-reference", id: "decision-1" }]
            }]
          }
        },
        {
          id: "memory-candidate-1",
          kind: ContextSourceKind.MemoryCandidate,
          priority: ContextSourcePriority.Low,
          provenance: { origin: "core" },
          tokenEstimate: { status: "estimated", tokens: 1 },
          references: [{ type: "message", id: "message-1", label: "candidate source" }],
          modelVisible: false,
          metadata: memoryMetadata
        }
      ],
      budget: {
        reservedOutputTokens: 1_000,
        estimatedInputTokens: 8,
        estimateStatus: "complete",
        warningThreshold: 0.7,
        compactThreshold: 0.85
      },
      pressure: {
        id: "pressure-attention",
        level: "none",
        reason: "projection is within budget",
        budget: {
          reservedOutputTokens: 1_000,
          estimatedInputTokens: 8,
          estimateStatus: "complete",
          warningThreshold: 0.7,
          compactThreshold: 0.85
        },
        sourceIds: ["state-current-objective", "trace-policy-decision", "memory-candidate-1"]
      },
      policyDecisions: []
    };

    expect(projection.messages).toEqual([{ role: "user", content: "Continue the current implementation." }]);
    expect(projection.sourceDescriptors.map((source) => source.kind)).toEqual([
      ContextSourceKind.StateProjection,
      ContextSourceKind.AccountableTrace,
      ContextSourceKind.MemoryCandidate
    ]);
    expect(JSON.stringify(memoryMetadata)).not.toContain("raw candidate text");
    expect(memoryMetadata.candidates[0]?.rawCandidateTextIncluded).toBe(false);
    expect(projection.sourceDescriptors.find((source) => source.kind === ContextSourceKind.AccountableTrace)?.modelVisible).toBe(false);
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
