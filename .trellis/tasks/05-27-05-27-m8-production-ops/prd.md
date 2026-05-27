# PRD: M8 Production And Operations

## Problem

Guga can now run through core, plugins, host protocol, SDK, and CLI, but production-facing surfaces are still scattered:

- provider configuration exists but no health/ops view explains availability;
- usage events exist but no audit export or metrics layer summarizes them;
- plugin capability discovery does not yet communicate trust and permission scope;
- replay exists but no small eval runner turns it into an operational regression tool.

## Product Outcome

After M8, Guga should have a small operational substrate that CLI/host/workbench can query:

- provider health;
- credential/config status without leaking secrets;
- audit summaries;
- trust/scope metadata;
- event-derived metrics;
- basic replay/eval results.

## Users

- Guga developer dogfooding CLI runs.
- Future desktop/Web workbench consuming operational state.
- Plugin/package authors checking trust, scopes, and health behavior.

## Requirements

1. Provider health is represented as typed data and exposed through a first-party package or host surface.
2. Credential/config resolution supports env/static configuration and redacts secrets in output.
3. Audit export summarizes run/tool/permission/usage events.
4. Capability descriptors include trust/scope information where available.
5. Eval/replay runner executes local fixtures and reports structured pass/fail diagnostics.
6. Metrics are derived from runtime events and exposed as in-memory snapshots.
7. Implementation uses existing core/plugin/event contracts where possible.

## Non-Goals

- Remote vault integration.
- Billing ledger.
- SaaS telemetry.
- Large benchmark suite.
- Deployment automation.

## Open Questions

- Should trust/scope metadata live directly on `CapabilityDescriptor`, or as optional `metadata` to avoid expanding every descriptor now?
- Should provider health be a capability kind, a provider descriptor field, or a host-runtime service?
- Should eval fixtures live under `packages/plugin-replay-audit`, a new `packages/plugin-eval`, or `packages/eval-runner`?

## Verification

- Focused package tests for every new package/contract.
- Redaction tests for config/audit output.
- Replay/eval fixture test.
- Full workspace gates.
