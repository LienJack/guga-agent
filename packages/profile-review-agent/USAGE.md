# @guga-agent/profile-review-agent Usage

## Purpose

`@guga-agent/profile-review-agent` provides first-party review/eval profile helpers. It creates review profile metadata, manages findings ledgers, and renders findings-first Markdown reports.

It does not edit code or integrate directly with a PR provider.

## Import

```ts
import {
  REVIEW_AGENT_PROFILE_ID,
  createReviewAgentProfile,
  createReviewFindingLedger,
  renderReviewReport
} from "@guga-agent/profile-review-agent";
```

## Main APIs

- Profile: `createReviewAgentProfile()`, `createReviewAgentSystemPrompt()`, and `REVIEW_AGENT_PROFILE_ID`.
- Findings ledger: `createReviewFindingLedger()`, `findingsBySeverity()`, and `validateReviewFindingLedger()`.
- Report writer: `checkReviewReportInput()` and `renderReviewReport()`.
- Types: `ReviewAgentProfile`, `ReviewConfidence`, `ReviewFinding`, `ReviewFindingCategory`, `ReviewFindingLedger`, `ReviewSeverity`, `ReviewReportInput`, and `ReviewReportQualityDiagnostic`.

## Common Usage

```ts
const ledger = createReviewFindingLedger([
  {
    id: "finding-1",
    severity: "P1",
    category: "correctness",
    confidence: "high",
    title: "Missing failure path",
    body: "The handler does not return an error on invalid input.",
    evidence: ["Invalid input test returns success."],
    recommendation: "Return a structured validation failure."
  }
]);

const report = renderReviewReport({
  title: "Code Review",
  ledger
});
```

## Parameters

- `createReviewAgentProfile()` and `createReviewAgentSystemPrompt()` take no parameters; they return stable review profile metadata and prompt text.
- `createReviewFindingLedger(findings)` accepts findings with required `id`, `title`, `severity`, `confidence`, `category`, `body`, and `evidence`. `file`, `line`, and `recommendation` are optional; `line` must be a positive integer when present.
- `severity` is ordered from `P0` through `P3`, and `confidence` is `"high"`, `"medium"`, or `"low"`. `category` should identify the risk family, such as correctness, security, performance, test gap, maintainability, protocol, permission, context, session, or profile.
- `renderReviewReport(input)` requires `title` and `ledger`. `openQuestions` and `summary` are optional. `checkReviewReportInput(input)` errors on invalid findings or an empty title and warns when the ledger has no findings.

## Notes

- Reports lead with actionable findings, then supporting context.
- Findings should be grounded in files, lines, commands, traces, or documented evidence.
- The package is a pure helper/profile package; hosts decide how to run reviews and where to publish reports.

## Related Packages

- `@guga-agent/profile-code-agent` handles code execution workflows.
- `@guga-agent/plugin-eval-runner` and `@guga-agent/eval-fixtures` support eval-style regression checks.
