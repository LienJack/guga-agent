# Build Agent From Zero: M20 Memory Review Report

M20 makes memory inspectable as a system.

Not just readable item by item. Inspectable as a ledger.

## The Gap After Export

M19 could render curated memory to Markdown.

That is useful, but it only shows what made it into active memory. It does not answer the operator questions around the edges:

- how many candidates exist;
- which ones are undecided;
- which ones were rejected;
- which ones were superseded;
- whether unsafe content tried to enter the pipeline;
- whether diagnostics are piling up.

Those questions matter before memory becomes influential.

## Report Before Automation

M20 adds a review report over the governed memory ledger.

The key restraint is that it still does not mutate anything.

No automatic decisions.
No `MEMORY.md` writes.
No prompt injection.

The report is a projection. It turns the ledger into counts, queues, and bounded Markdown.

## What The Report Shows

The typed report includes:

- active items;
- superseded items;
- rejected candidate ids;
- undecided candidates;
- unsafe candidates;
- governance diagnostics;
- summary counts for each bucket.

This gives future hosts a small dashboard-shaped API without committing to a UI yet.

## Why This Matters

Long-term memory needs review surfaces before it needs more autonomy.

If the agent is going to remember, the system should first make it cheap to ask: what exactly does it think it remembers, what did it refuse, and what still needs a human decision?

M20 answers that without changing the source of truth.

The source of truth is still the candidate and decision trail.
The report is the audit lens.
