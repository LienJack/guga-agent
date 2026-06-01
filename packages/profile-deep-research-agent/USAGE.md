# @guga-agent/profile-deep-research-agent Usage

## Purpose

`@guga-agent/profile-deep-research-agent` provides first-party deep-research profile helpers. It focuses on source policy, evidence ledgers, and structured report generation.

Use it when building research workflows that need to separate facts, inferences, and claims that still need verification.

## Import

```ts
import {
  DEEP_RESEARCH_PROFILE_ID,
  createDeepResearchProfile,
  createEvidenceLedger,
  renderResearchReport,
  sortSourcesByPolicy
} from "@guga-agent/profile-deep-research-agent";
```

## Main APIs

- Profile: `createDeepResearchProfile()`, `createDeepResearchSystemPrompt()`, and `DEEP_RESEARCH_PROFILE_ID`.
- Source policy: `classifyResearchSource()`, `defaultResearchSourcePolicy`, and `sortSourcesByPolicy()`.
- Evidence ledger: `createEvidenceLedger()`, `evidenceByStrength()`, and `validateEvidenceLedger()`.
- Report writer: `checkResearchReportInput()` and `renderResearchReport()`.
- Types: `DeepResearchProfile`, `ResearchSourceLayer`, `ResearchSourcePolicyItem`, `EvidenceItem`, `EvidenceLedger`, `EvidenceStrength`, `ResearchReportInput`, and `ResearchReportQualityDiagnostic`.

## Common Usage

```ts
const sources = sortSourcesByPolicy([
  "docs/research/context-packs/agent-loop.md",
  "/path/to/raw/source.ts"
]);

const evidence = createEvidenceLedger([
  {
    id: "evidence-1",
    claim: "The design uses a curated research funnel.",
    strength: "Fact",
    source: sources[0],
    summary: "Project instructions define a layered research process.",
    capturedAt: new Date().toISOString(),
    confidence: 1
  }
]);

const report = renderResearchReport({
  title: "Agent Loop Research",
  conclusion: "Use curated evidence before opening raw source.",
  projectComparison: ["Reference projects converge on explicit loop state."],
  reusablePatterns: ["Keep evidence strength visible in reports."],
  avoidPatterns: ["Do not start from raw source when curated context exists."],
  gugaLanding: ["Document decisions with Fact/Inference/Pending Verification labels."],
  ledger: evidence
});
```

## Notes

- This package does not modify code and does not perform web or filesystem research by itself.
- It provides profile text and pure helpers for hosts or agents to apply.
- Source policy is intended to prefer curated materials before raw source.

## Related Packages

- `@guga-agent/profile-code-agent` can consume research outputs during planning.
- `@guga-agent/profile-review-agent` provides a findings-first review profile for a different workflow.
