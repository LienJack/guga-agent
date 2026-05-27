# M8 Production And Operations Requirements

## Goal

Make Guga safer and more operable for real CLI/host usage without turning `packages/core` into a product shell.

M8 should add production-facing contracts and first-party plugins for health, config, audit, trust, eval/replay, and metrics. It should not build an enterprise control plane.

## MVP Scope

- Provider health reporting:
  - model/provider descriptors expose availability signals;
  - host/CLI can inspect provider health without invoking a full agent run;
  - health checks are typed and testable.
- Credential/config path:
  - read provider configuration from explicit env/config inputs;
  - keep credentials out of event payloads and debug output;
  - define the first credential resolver interface, even if it only supports env/static values.
- Usage/cost/audit operations:
  - normalize usage events into an exportable audit summary;
  - keep unknown cost explicit instead of silently treating it as zero;
  - expose audit export as a plugin or host service, not core UI logic.
- Plugin trust and permission scope:
  - distinguish trusted first-party plugins from project/user plugins;
  - add a typed trust/scope descriptor to capability discovery;
  - make permission/capability scope inspectable by host surfaces.
- Basic eval/replay runner:
  - run small replay/eval fixtures against existing runtime/replay contracts;
  - produce structured pass/fail output;
  - avoid a large benchmark framework in this slice.
- Observability metrics:
  - collect run/tool/provider/permission counters from events;
  - expose an in-memory metrics snapshot;
  - no external telemetry backend yet.

## Non-Goals

- No paid billing system.
- No remote credential vault.
- No OAuth refresh daemon.
- No enterprise policy server.
- No production deployment platform.
- No full eval dashboard.
- No durable metrics backend.

## Acceptance Criteria

- M8 implementation remains plugin/host-first; core changes are limited to stable contracts needed by multiple packages.
- Provider health/config path has hermetic tests and does not require real API keys.
- Audit export redacts credentials and can summarize a completed mock run.
- Capability discovery can explain trust/scope metadata.
- Eval/replay runner can execute at least one local fixture and report structured results.
- Metrics snapshot is derived from runtime events.
- `pnpm -r --workspace-concurrency=1 test`, `pnpm -r typecheck`, and `pnpm -r build` pass.
- A M8 article is written under `blog/`.
