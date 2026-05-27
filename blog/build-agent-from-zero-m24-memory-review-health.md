# Build Agent From Zero: M24 Memory Review Health

M24 gives memory a status light.

Not an autonomous decision. Not a repair system. Just a clear signal.

## The Problem With Raw Counts

The memory review report already says a lot:

- active items;
- undecided candidates;
- unsafe candidates;
- rejected candidates;
- superseded items;
- diagnostics.

That is useful for detail, but a host often needs one higher-level answer:

Can this memory surface be treated as healthy, does it need a human review pass, or is it blocked?

## Three States

M24 adds `createMemoryReviewHealth(report)`.

It returns one of three statuses:

- `healthy`
- `needs_review`
- `blocked`

The rules are intentionally simple.

Unsafe candidates or governance diagnostics mean `blocked`.

Undecided candidates mean `needs_review`.

Rejected and superseded items are informational. They do not make the system unhealthy by themselves.

## Why This Matters

As memory gets closer to host surfaces, the system needs small durable signals that humans and UI can trust.

The detailed report is still there for inspection. The health summary is the first glance.

This keeps the architecture honest:

- report for audit;
- health for gating;
- decisions still require explicit governance.

The agent does not get to quietly decide that memory is safe. It only gets to explain the state it sees.
