# M13 Review Eval Agent PRD

## Summary

Build a first-party review/eval profile with finding ledger and report helpers.

## Goals

- Ship `@guga-agent/profile-review-agent`.
- Add finding ledger helpers.
- Add report writer helpers.
- Add CLI `--profile review`.

## Non-Goals

- No GitHub/PR API integration.
- No automatic edits.
- No new core control flow.
- No review swarm.

## Requirements

1. Profile metadata and prompt are exported.
2. Findings are sorted by severity and location.
3. Ledger validation detects duplicate ids and missing evidence.
4. Report writer leads with findings.
5. CLI accepts review profile.

## Acceptance

- Focused package tests pass.
- CLI focused tests pass.
- Full repo gates pass.
