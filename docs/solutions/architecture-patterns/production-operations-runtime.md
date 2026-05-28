# Production Operations Runtime

M8 adds the first production operations substrate for Guga without turning core into an ops platform.

## Problem

Once an agent is runnable from a CLI and host protocol, users need answers to operational questions that are not the final assistant message:

- which providers and operational capabilities are available;
- whether provider credentials are configured without leaking raw secrets;
- what happened in a run, including tool, permission, failure, and usage totals;
- whether fixture-based evals can catch regressions without real API keys;
- how host/CLI clients can read the same facts.

Putting these answers in ad hoc logs would make every host surface invent its own truth. Putting all operational behavior in core would make the runtime too product-specific.

## Decision

Use a plugin-first operations substrate:

1. `@guga-agent/core` defines stable contracts: provider health, credential config views, audit summaries, metrics snapshots, and trust descriptors.
2. First-party plugins provide behavior:
   - `@guga-agent/plugin-ops-health`
   - `@guga-agent/plugin-audit-export`
   - `@guga-agent/plugin-eval-runner`
3. Capability descriptors carry optional trust/scope metadata so hosts can explain who owns an operation and what it can access.
4. Host protocol exposes operations as resources:
   - `GET /operations/health`
   - `GET /operations/audit`
   - `GET /operations/metrics`
   - `GET /operations/status`
5. CLI consumes host SDK state through `guga run --ops` rather than reading runtime internals.

## Why This Shape

- **Core stays small.** Core owns the vocabulary and event stream, while plugins own production behaviors.
- **Secrets stay out of summaries.** Credential views are redacted by construction, and audit export aggregates counts/failures/usage without copying prompts, tool inputs, or tool outputs.
- **Metrics are event-derived.** Host metrics come from buffered host events, so CLI, SDK, and future workbench surfaces agree.
- **Eval is hermetic.** The first eval runner uses mock provider responses and structured expectations, avoiding network and credential requirements.
- **Trust compounds M6.** Capability discovery now carries optional trust/scope, so operational resources can show first-party capabilities without breaking existing descriptor consumers.

## Current Limits

- Provider health resources currently report registered providers as `unknown` unless a caller runs a concrete health check through the ops plugin helpers.
- Host audit/metrics are in-memory and scoped to the local host runtime.
- Eval fixtures are local and sequential; this is a regression harness seed, not a benchmark platform.
- Cost aggregation stays explicit: known host `costUsd` can be summed, otherwise cost remains `unknown` with a reason.

## Verification

Focused gates added in this slice:

- Core contract and capability descriptor tests.
- Ops health redaction and health-check tests.
- Audit export tests that assert sensitive values do not appear in summaries.
- Eval runner tests for passing fixtures, failing diagnostics, suite counts, and operation registration.
- Host server/SDK/CLI tests for operations resources and `--ops`.
