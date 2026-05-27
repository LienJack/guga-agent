# Deep Research Agent Profile

M10 adds a first-party research profile as a reusable package, not as a hidden branch in the agent loop.

## Problem

Guga has a strong project rule for reference research:

- start from context packs and architecture notes;
- drill into graphs and packed context only when needed;
- avoid raw-source-first research;
- separate `Fact`, `Inference`, and `Pending Verification`;
- return reports in a stable Chinese section format.

Those rules are useful enough to become product behavior. Keeping them only in `AGENTS.md` would make every research run depend on prompt memory.

## Decision

Create `@guga-agent/profile-deep-research-agent`.

The package exports:

- `createDeepResearchProfile()`
- `createDeepResearchSystemPrompt()`
- `defaultResearchSourcePolicy`
- `classifyResearchSource()`
- `sortSourcesByPolicy()`
- `createEvidenceLedger()`
- `validateEvidenceLedger()`
- `renderResearchReport()`
- `checkResearchReportInput()`

CLI selects it explicitly with `guga run --profile deep-research`.

## Why This Shape

- **Research policy is typed.** The 7-layer funnel is represented as source layers and priorities rather than prose alone.
- **Evidence is durable.** A ledger can be validated, grouped, rendered, and later stored or searched.
- **Reports stay consistent.** The writer emits the required sections every time.
- **Core stays role-neutral.** No research-specific imports were added to `packages/core`.
- **Future autonomy has a contract.** Search, browser, subagents, and memory can plug into ledger production later.

## Current Limits

- No external web search orchestration.
- No subagent delegation.
- No source downloader or crawler.
- No persistent evidence database.
- No automatic citation verification beyond local diagnostics.

## Verification

Focused gates added in this slice:

- Profile metadata and prompt tests.
- Source classification and policy sorting tests.
- Evidence ledger validation and grouping tests.
- Report rendering and quality diagnostic tests.
- CLI `--profile deep-research` and unknown profile tests.
