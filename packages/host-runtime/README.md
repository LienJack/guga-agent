# @guga-agent/host-runtime

In-process host service for wrapping `@guga-agent/core` runtime with session/run resources and canonical host events.

This package owns host-facing state projection. It does not implement HTTP, CLI, Web UI, or desktop UI.

For autonomous code tasks, HostRuntime treats typed `task.*` and `verification.*` host events as live UI projection and also flushes them as host-sourced durable event envelopes when an `EventStore` is configured. The durable envelopes use stable `host.task.*` / `host.verification.*` event types and idempotency keys so resume/replay can recover task facts without depending on `InMemoryRunStore`.

Task resources expose compact ledger progress through `ledgerSummary`; detailed evidence remains referenced from the task plan and durable events.
