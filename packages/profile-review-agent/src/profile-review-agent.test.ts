import { describe, expect, it } from "vitest";
import { createReviewFindingLedger, findingsBySeverity, validateReviewFindingLedger } from "./finding-ledger";
import { createReviewAgentProfile } from "./profile";
import { checkReviewReportInput, renderReviewReport } from "./report-writer";

describe("profile-review-agent", () => {
  it("exports profile metadata and prompt guidance", () => {
    const profile = createReviewAgentProfile();

    expect(profile.id).toBe("review");
    expect(profile.systemPrompt).toContain("findings-first");
    expect(profile.nonGoals).toContain("Automatically edit code");
  });

  it("sorts and groups findings by severity", () => {
    const ledger = createReviewFindingLedger([
      finding({ id: "minor", severity: "P3", file: "b.ts", line: 2 }),
      finding({ id: "major", severity: "P1", file: "a.ts", line: 1 })
    ]);

    expect(ledger.findings.map((candidate) => candidate.id)).toEqual(["major", "minor"]);
    expect(findingsBySeverity(ledger).P1.map((candidate) => candidate.id)).toEqual(["major"]);
  });

  it("validates ledger quality", () => {
    const ledger = createReviewFindingLedger([
      finding({ id: "dup", evidence: [] }),
      finding({ id: "dup", line: 0 })
    ]);

    expect(validateReviewFindingLedger(ledger)).toEqual([
      "Finding dup must include evidence",
      "Duplicate finding id: dup",
      "Finding dup line must be a positive integer"
    ]);
  });

  it("renders findings before summary", () => {
    const ledger = createReviewFindingLedger([
      finding({
        id: "p1",
        title: "Permission denial is swallowed",
        severity: "P1",
        category: "permission",
        recommendation: "Return a model-visible denied result."
      })
    ]);
    const report = renderReviewReport({
      title: "Review",
      ledger,
      openQuestions: ["Should this be P0 for production?"],
      summary: "One important permission issue."
    });

    expect(report.indexOf("## Findings")).toBeLessThan(report.indexOf("## Summary"));
    expect(report).toContain("Permission denial is swallowed");
    expect(checkReviewReportInput({ title: "Review", ledger })).toEqual([]);
    expect(checkReviewReportInput({ title: "", ledger: createReviewFindingLedger([]) })).toEqual([
      { severity: "warning", message: "Review report has no findings; confirm this is intentional" },
      { severity: "error", message: "Review report title is required" }
    ]);
  });
});

function finding(overrides: Partial<Parameters<typeof createReviewFindingLedger>[0][number]> = {}): Parameters<typeof createReviewFindingLedger>[0][number] {
  return {
    id: "finding",
    title: "Finding",
    severity: "P2",
    confidence: "high",
    category: "correctness",
    body: "The behavior can regress.",
    evidence: ["test evidence"],
    ...overrides
  };
}
