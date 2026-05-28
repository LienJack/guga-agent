---
date: 2026-05-28
topic: m13-review-eval-agent
---

# M13 Review / Eval Agent Requirements

## Summary

Add a first-party review/eval agent profile that specializes in code review findings, risk classification, and review reports without adding review-specific branches to core.

## Goals

- Ship `@guga-agent/profile-review-agent`.
- Encode review finding severity, confidence, category, and evidence.
- Provide a review report writer with findings-first output.
- Add CLI `--profile review`.
- Keep core unchanged.

## Non-Goals

- No automatic code edits.
- No PR provider integration.
- No GitHub API integration.
- No reviewer swarm.
- No benchmark dashboard.

## Requirements

1. The profile exports stable metadata and system prompt.
2. Findings support severity `P0` through `P3`.
3. Findings support confidence and category metadata.
4. The report writer renders findings first, then open questions, then summary.
5. Diagnostics catch duplicate finding ids and missing evidence.
6. CLI accepts `--profile review`.
7. Tests are hermetic.

## Acceptance

- Focused tests for profile, finding ledger, report writer, and CLI profile selection.
- Package test/typecheck/build pass.
- Full repo gates pass.
