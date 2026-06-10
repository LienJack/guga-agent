# Context Policy Plugins

Guga builds model input through a `ModelInputProjection` before every provider request. The projection is an immutable envelope around provider-visible `CoreMessage[]` and `ToolDefinition[]`, plus source descriptors, token estimates, pressure decisions, policy decisions, safe derived-source summaries, and a projection hash.

## Source Hierarchy

System and developer instructions are protected. Pending user turns, unresolved tool rounds, recent tail, active tools, permission mode, host context, active resources, plans, skills, tool result previews, artifact references, state projections, accountable traces, memory candidates, and compaction summaries are represented as typed context sources.

Raw events, tool results, artifact references, and compaction boundaries remain facts. State projections, accountable traces, memory candidates, and summaries are derived context surfaces. Compaction summaries and reinjected state/trace context are historical/task context; they must not become system or developer instructions. Memory candidates remain candidate-only unless a future memory policy explicitly promotes them.

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

`@guga-agent/plugin-context-default` registers the first-party default context policy. It proves host apps can replace context behavior through plugin registration without changing `AgentLoop`. The default policy observes and annotates Attention OS sources; it does not mutate durable facts, conversation state, artifact evidence, or the final provider request.

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

Compaction summaries preserve eight structured fields: objective, completed work, current blockers, next steps, key files and symbols, tool result references, unresolved questions, and user constraints. The local skeleton uses state and trace source references when available, while avoiding raw tool/artifact content. Every compact result also records iteration number, parent summary reference when present, retained and compacted source ids, preprocessing flags, stripped round ids, degradation mode, and quality/continuity metadata.

## Ledger

The M4 ledger is deliberately narrow. It records projection descriptors, source references, policy decisions, compaction boundaries, projection hashes, and safe source metadata summaries such as ontology, sensitivity, confidence, scope, intended usage, item kinds, and memory-candidate counts. It does not store raw artifact content, raw tool output, or raw memory candidate text.

## Future Split Points

The default plugin may later split into `basic`, `tool-results`, `truncation`, `compaction`, and `reinjection` packages. M4 keeps one package so hosts have a clear first policy to install or replace.
