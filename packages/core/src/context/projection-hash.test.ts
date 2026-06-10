import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority, type ContextSourceDescriptor } from "../contracts/context";
import { ModelInputProjector } from "./model-input-projection";

describe("computeProjectionHash", () => {
  it("produces stable hashes for identical source descriptors and model metadata", () => {
    const left = new ModelInputProjector({ idFactory: () => "left" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 100 } }
    });
    const right = new ModelInputProjector({ idFactory: () => "right" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 100 } }
    });

    expect(left.hash?.value).toBe(right.hash?.value);
  });

  it("changes hashes when context budget semantics differ", () => {
    const left = new ModelInputProjector({ idFactory: () => "left" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 100 } }
    });
    const right = new ModelInputProjector({ idFactory: () => "right" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 200 } }
    });

    expect(left.hash?.value).not.toBe(right.hash?.value);
  });

  it("hashes safe derived metadata summaries without raw metadata content", () => {
    const projector = new ModelInputProjector();
    const left = projector.assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      additionalSources: [memoryCandidateSource("raw secret A", "sensitive")]
    });
    const right = projector.assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      additionalSources: [memoryCandidateSource("raw secret B", "sensitive")]
    });
    const changedSummary = projector.assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      additionalSources: [memoryCandidateSource("raw secret A", "internal")]
    });

    expect(left.hash?.value).toBe(right.hash?.value);
    expect(left.hash?.value).not.toBe(changedSummary.hash?.value);
  });
});

function memoryCandidateSource(rawCandidateText: string, sensitivity: "internal" | "sensitive"): ContextSourceDescriptor {
  return {
    id: "memory-candidate",
    kind: ContextSourceKind.MemoryCandidate,
    priority: ContextSourcePriority.Low,
    provenance: { origin: "core" },
    tokenEstimate: { status: "estimated", tokens: 1 },
    references: [{ type: "message", id: "message-0" }],
    modelVisible: false,
    metadata: {
      ontology: ContextSourceKind.MemoryCandidate,
      sensitivity,
      confidence: "medium",
      scope: "session",
      intendedUsage: ["memory-review", "audit"],
      rawCandidateText,
      candidates: [{ candidateId: "candidate-1", rawCandidateTextIncluded: false }]
    }
  };
}
