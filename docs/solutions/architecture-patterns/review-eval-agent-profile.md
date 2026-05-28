# Review Eval Agent Profile

M13 adds a first-party review/eval role as a profile package.

## Problem

Code review and eval analysis need a different output shape than coding or research. A useful review should lead with risks, not summaries. It should classify severity, cite evidence, identify missing tests, and route findings to the right system layer.

Putting that behavior into core would make the runtime know about a product role. Guga already has the better pattern from M9 and M10: profiles own role-specific behavior.

## Decision

Create `@guga-agent/profile-review-agent`.

The package exports:

- `createReviewAgentProfile()`
- `createReviewAgentSystemPrompt()`
- `createReviewFindingLedger()`
- `validateReviewFindingLedger()`
- `findingsBySeverity()`
- `renderReviewReport()`
- `checkReviewReportInput()`

CLI selects it with `guga run --profile review`.

## Why This Shape

- **Findings are typed.** Severity, confidence, category, evidence, location, and recommendation are explicit.
- **Reports are findings-first.** Open questions and summary come after actionable issues.
- **Core remains role-neutral.** No review imports or branches were added to `packages/core`.
- **Eval can grow later.** PR integrations, review comments, and benchmark dashboards can consume the ledger later.
- **The profile composes with existing ops.** CLI review runs use the same host path and operational plugins as other non-code profiles.

## Current Limits

- No GitHub or PR API integration.
- No inline review comment writer.
- No automatic fixes.
- No reviewer swarm.
- No benchmark dashboard.

## Verification

Focused gates added in this slice:

- Profile metadata and prompt tests.
- Finding ledger sort/group/validation tests.
- Findings-first report rendering tests.
- CLI `--profile review` test.
