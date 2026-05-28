import { describe, expect, it } from "vitest";
import { createDeepResearchProfile } from "./profile";
import { classifyResearchSource, sortSourcesByPolicy } from "./source-policy";
import { createEvidenceLedger, evidenceByStrength, validateEvidenceLedger } from "./evidence-ledger";
import { checkResearchReportInput, renderResearchReport } from "./report-writer";

describe("profile-deep-research-agent", () => {
  it("defines profile metadata and research prompt", () => {
    const profile = createDeepResearchProfile();

    expect(profile.id).toBe("deep-research");
    expect(profile.goals).toContain("Record claims in an evidence ledger");
    expect(profile.systemPrompt).toContain("Follow the project research funnel");
  });

  it("classifies and sorts sources by the 7-layer funnel", () => {
    expect(classifyResearchSource("docs/research/context-packs/agent-loop.md")).toBe("context-pack");
    expect(classifyResearchSource("docs/research/source-analysis/deerflow-book/chapters/05-lead-agent.md")).toBe("source-analysis");
    expect(classifyResearchSource("/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app.py")).toBe("raw-source");
    expect(sortSourcesByPolicy([
      "/agent-ref/raw.ts",
      "docs/research/repomix/opencode-token-tree.txt",
      "docs/research/context-packs/multi-agent.md"
    ])).toEqual([
      "docs/research/context-packs/multi-agent.md",
      "docs/research/repomix/opencode-token-tree.txt",
      "/agent-ref/raw.ts"
    ]);
  });

  it("groups and validates evidence", () => {
    const ledger = createEvidenceLedger([
      evidence("b", "Inference", "middleware composition is useful"),
      evidence("a", "Fact", "DeerFlow has lead agent")
    ]);

    expect(ledger.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(evidenceByStrength(ledger).Fact).toHaveLength(1);
    expect(validateEvidenceLedger(ledger)).toEqual([]);
    expect(validateEvidenceLedger(createEvidenceLedger([
      { ...evidence("bad", "Fact", "bad"), confidence: 2 }
    ]))).toContain("Evidence bad confidence must be between 0 and 1");
  });

  it("renders required research report sections and checks quality", () => {
    const ledger = createEvidenceLedger([
      evidence("fact-1", "Fact", "DeerFlow lead agent composes tools")
    ]);
    const input = {
      title: "Deep Research Agent",
      conclusion: "Use evidence ledger first.",
      projectComparison: ["DeerFlow: lead/subagent workflow"],
      reusablePatterns: ["Self-contained subtasks"],
      avoidPatterns: ["Raw source first"],
      gugaLanding: ["Implement profile package"],
      ledger
    };

    expect(renderResearchReport(input)).toContain("## Guga 落点");
    expect(renderResearchReport(input)).toContain("### Fact");
    expect(checkResearchReportInput(input)).toEqual([]);
    expect(checkResearchReportInput({ ...input, ledger: createEvidenceLedger([]) })).toEqual([
      expect.objectContaining({ code: "MISSING_EVIDENCE" })
    ]);
  });
});

function evidence(id: string, strength: "Fact" | "Inference" | "Pending Verification", claim: string) {
  return {
    id,
    claim,
    strength,
    source: "docs/research/source-analysis/example.md",
    summary: claim,
    capturedAt: "2026-05-28T00:00:00.000Z",
    confidence: 0.8
  };
}
