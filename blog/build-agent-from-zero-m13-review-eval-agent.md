# Build Agent From Zero: M13 Review Eval Agent

M13 adds a reviewer.

Not a GitHub bot, not an auto-fixer, and not a second runtime. A reviewer, in Guga's architecture, is a role profile that knows how to turn evidence into findings.

## The Problem

Review output has a different shape from ordinary agent output.

A coding agent can say what it changed. A research agent can say what it found. A review agent has to do something sharper:

- identify concrete risks;
- rank severity;
- explain confidence;
- cite evidence;
- ask open questions;
- keep summary secondary.

If a review starts with a friendly changelog and hides the bug in paragraph five, it has failed its job.

## The Move

M13 introduces `@guga-agent/profile-review-agent`.

The package owns:

- review profile metadata;
- review system prompt;
- finding ledger helpers;
- severity grouping;
- validation diagnostics;
- Markdown report rendering.

Core does not change.

## Findings First

The central object is a finding.

It carries:

- `severity`: `P0`, `P1`, `P2`, or `P3`;
- `confidence`: high, medium, or low;
- `category`: correctness, security, test gap, permission, context, session, profile, and related risk areas;
- `evidence`: concrete support for the claim;
- optional file and line;
- optional recommendation.

That structure keeps review output from becoming a vague opinion essay.

## Report Shape

The report writer renders:

```text
Findings
-> Open Questions
-> Summary
```

That order is intentional. A reviewer should make the risky thing easy to see first.

## CLI Entry

The CLI now accepts:

```bash
guga run "review this diff" --mock --profile review
```

It goes through the same host path as the other profiles. Review is a role, not a runtime fork.

## What Comes Later

M13 does not write PR comments. It does not call GitHub. It does not patch code automatically.

Those are integration layers. The first contract is simpler: can Guga represent review findings in a way that is testable, sortable, and reusable?

Now it can.
