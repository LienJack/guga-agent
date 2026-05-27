# Build Agent From Zero: M32 Memory JSONL Audit Snapshot Capability

M32 makes the big memory inspection view discoverable.

## The Bundle Exists

M29 introduced:

`JsonlMemoryStore.readAuditSnapshot()`

It returns the durable ledger, review report, health summary, Markdown audit view, and JSONL diagnostics from one read.

That is a good API for inspection.

But an agent workbench still needs to know the capability exists.

## Discovery Before Wiring

M32 adds:

`memory.jsonl.audit_snapshot`

This is not a tool.

It is not a CLI command.

It is a descriptor that says: this plugin can provide a read-only durable audit bundle.

That is enough for a host to decide whether to show a memory inspection panel, enable a menu item, or explain why a view is unavailable.

## Why It Remains Read-Only

An audit snapshot should be boring in the best way.

It reads memory facts.

It returns diagnostics.

It does not accept, reject, rewrite, compact, or inject anything.

The descriptor therefore uses the same read-only trust shape as the other JSONL projection surfaces.

## The Pattern

Guga's plugin ecosystem should not make host surfaces guess.

When a store gains a meaningful projection, add a descriptor.

When a projection mutates nothing, keep it read-only.

M32 is that rule applied to the full audit bundle.
