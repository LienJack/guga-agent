# Context Policy Plugins

Guga builds model input through a `ModelInputProjection` before every provider request. The projection is an immutable envelope around provider-visible `CoreMessage[]` and `ToolDefinition[]`, plus source descriptors, token estimates, pressure decisions, policy decisions, and a projection hash.

## Source Hierarchy

System and developer instructions are protected. Pending user turns, unresolved tool rounds, recent tail, active tools, permission mode, host context, active resources, plans, skills, tool result previews, artifact references, and compaction summaries are represented as typed context sources. Compaction summaries are historical task context; they must not become system or developer instructions.

## Hook Safety

Context hooks run through `HookKernel` phases:

- `resources.discover`
- `context.assemble`
- `context.budget`
- `context.truncate`
- `context.compact.before`
- `context.compact.after`
- `context.reinject`

Hooks return typed contributions, patches, gates, reinjection decisions, or annotations. They do not mutate conversation state, event history, or the final provider request directly. Mutating, blocking, and compaction-relevant decisions are emitted as auditable context events.

## Default Policy

`@guga-agent/plugin-context-default` registers the first-party default context policy. It proves host apps can replace context behavior through plugin registration without changing `AgentLoop`.

Default compaction thresholds:

- `warningThreshold`: `0.70`
- `compactThreshold`: `0.85`
- `minCompressionGain`: `0.10`
- `maxCompactFailures`: `3`
- `cooldownTurns`: `2`
- `reactiveRetryLimit`: `1`
- `summaryStripFraction`: `0.20`
- `summaryStripRetryLimit`: `3`
- `preSummaryDedup`: enabled

## Summary Contract

Compaction summaries preserve eight structured fields: objective, completed work, current blockers, next steps, key files and symbols, tool result references, unresolved questions, and user constraints. Every compact result also records iteration number, parent summary reference when present, preprocessing flags, stripped round ids, and degradation mode.

## Ledger

The M4 ledger is deliberately narrow. It records projection descriptors, source references, policy decisions, compaction boundaries, and projection hashes. It does not store raw artifact content and does not implement session resume; those remain M5 responsibilities.

## Future Split Points

The default plugin may later split into `basic`, `tool-results`, `truncation`, `compaction`, and `reinjection` packages. M4 keeps one package so hosts have a clear first policy to install or replace.
