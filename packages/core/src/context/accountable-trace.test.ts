import { describe, expect, it } from "vitest";
import { ContextSourceKind, type ContextPolicyDecision } from "../contracts/context";
import { ModelInputProjector } from "./model-input-projection";
import { buildAccountableTraceSource } from "./accountable-trace";

describe("buildAccountableTraceSource", () => {
  it("projects explicit actions, observations, evidence, and policy decisions without hidden reasoning text", () => {
    const policyDecision: ContextPolicyDecision = {
      id: "decision-1",
      kind: "source-contribution",
      phase: "context.assemble",
      sourceIds: ["resource:file"],
      reason: "include active resource"
    };
    const projection = new ModelInputProjector({ idFactory: () => "trace-base" }).assemble({
      runId: "run-trace",
      turn: 0,
      messages: [
        { role: "user", content: "Inspect the file." },
        {
          role: "assistant",
          toolCalls: [{ id: "call-1", name: "read_file", input: { path: "README.md" } }]
        },
        { role: "tool", toolCallId: "call-1", name: "read_file", content: "README preview", isError: false }
      ],
      tools: [],
      policyDecisions: [policyDecision]
    });

    const source = buildAccountableTraceSource(projection);

    expect(source).toMatchObject({
      id: "trace-projection-trace-base",
      kind: ContextSourceKind.AccountableTrace,
      modelVisible: false
    });
    expect(source?.metadata).toMatchObject({
      ontology: ContextSourceKind.AccountableTrace,
      generatedFromDecisionIds: ["decision-1"],
      items: expect.arrayContaining([
        expect.objectContaining({ kind: "action", label: "assistant requested tool action" }),
        expect.objectContaining({ kind: "observation", label: "tool returned observation" }),
        expect.objectContaining({ kind: "evidence", label: "source evidence: tool_result_preview" }),
        expect.objectContaining({ kind: "decision", label: "context decision: source-contribution" })
      ])
    });
    expect(JSON.stringify(source?.metadata)).not.toContain("README preview");
    expect(JSON.stringify(source?.metadata).toLowerCase()).not.toContain("chain-of-thought");
  });

  it("records context pressure as an auditable observation", () => {
    const projection = new ModelInputProjector({ idFactory: () => "pressure" }).assemble({
      runId: "run-trace",
      turn: 0,
      messages: [{ role: "user", content: "A".repeat(200) }],
      tools: [],
      model: {
        providerId: "mock",
        modelId: "tiny",
        metadata: { providerId: "mock", modelId: "tiny", contextWindow: 80, maxOutputTokens: 10 }
      }
    });

    const source = buildAccountableTraceSource(projection);

    expect(source?.metadata).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ kind: "observation", label: "context pressure: warning" })
      ])
    });
  });

  it("returns no descriptor when there is no explicit trace material", () => {
    const projection = new ModelInputProjector({ idFactory: () => "empty" }).assemble({
      runId: "run-trace",
      turn: 0,
      messages: [],
      tools: []
    });

    expect(buildAccountableTraceSource(projection)).toBeUndefined();
  });
});
