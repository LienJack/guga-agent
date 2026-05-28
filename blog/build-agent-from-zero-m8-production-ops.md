# Build Agent From Zero: M8 Production Operations

M8 is the moment Guga stops being only a runnable agent loop and starts gaining an operations spine.

The goal was deliberately narrow: add provider health, redacted config views, audit summaries, metrics snapshots, trust metadata, and a small eval runner without building a telemetry product or credential platform too early.

## The Boundary

The key decision was to keep core as the contract owner, not the operations owner.

Core now defines the shared language:

- `ProviderHealth`
- `CredentialConfigView`
- `AuditSummary`
- `MetricsSnapshot`
- `TrustDescriptor`

Everything with behavior lives in first-party packages. That keeps operational concerns visible and typed while preserving the runtime's shape.

## Three Plugins

`@guga-agent/plugin-ops-health` handles redacted provider configuration and mockable health checks. The important property is not that health checks are sophisticated yet; it is that config can be inspected without returning raw keys.

`@guga-agent/plugin-audit-export` turns event streams into summaries. It counts runs, tools, permissions, failures, and usage while refusing to copy prompts, tool arguments, or tool outputs into the exported object.

`@guga-agent/plugin-eval-runner` gives the project a hermetic regression harness. A fixture provides mock provider responses and expectations; the runner returns structured diagnostics instead of needing network credentials.

## Host And CLI

M7/M11 gave Guga a host protocol. M8 adds operations resources to that same surface:

- `/operations/health`
- `/operations/audit`
- `/operations/metrics`
- `/operations/status`

The SDK reads those resources directly. The CLI uses the SDK, so `guga run --ops` prints a compact status line from the same path future UI clients will use.

That matters because the CLI is not a privileged shortcut. It is just another host client.

## What Changed Architecturally

Capability descriptors now support optional trust/scope metadata. This lets the runtime say, for example, that `audit.summary` is a first-party operation with audit read scope.

This is small, but it opens a clean product path. A workbench can explain which operational capabilities exist, who provided them, and what they claim to access.

## What We Did Not Build

M8 intentionally avoids:

- remote credential vaults;
- provider key pools;
- SaaS telemetry;
- benchmark dashboards;
- billing ledgers;
- deployment supervisors.

Those will need stronger policy and UX. The first useful layer is typed, local, redacted, and testable.

## Result

M8 makes Guga easier to operate without making it heavier to understand. The agent can now answer operational questions through structured resources, and each answer has a place to grow.
