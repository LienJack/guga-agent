# @guga-agent/plugin-memory-candidates Usage

## Purpose

`@guga-agent/plugin-memory-candidates` contains pure memory candidate, governance, retrieval, Markdown rendering, and review-report helpers. It also exposes small operation-registration plugins for first-party memory surfaces.

Use this package for memory logic and views. It does not provide persistent storage or a model-visible tool by itself.

## Import

```ts
import {
  createMemoryCandidate,
  createMemoryCandidateLedger,
  createMemoryCandidatesPlugin,
  createMemoryGovernanceLedger,
  renderGovernedMemoryBlock,
  searchGovernedMemoryItems
} from "@guga-agent/plugin-memory-candidates";
```

## Main APIs

- Candidate helpers: `createMemoryCandidate()`, `createMemoryCandidateLedger()`, `scanMemoryCandidateContent()`, `validateMemoryCandidate()`, and `renderMemoryContextBlock()`.
- Governance helpers: `createMemoryGovernanceLedger()`, `validateMemoryDecision()`, `listMemoryItemsByScope()`, and `renderGovernedMemoryBlock()`.
- Retrieval helpers: `searchGovernedMemoryItems()` and `renderMemoryRetrievalBlock()`.
- Markdown/review helpers: `renderCuratedMemoryMarkdown()`, `createMemoryReviewHealth()`, `createMemoryReviewReport()`, `renderMemoryReviewHealthBlock()`, and `renderMemoryReviewReport()`.
- Plugins: `createMemoryCandidatesPlugin()`, `createMemoryGovernancePlugin()`, and `createMemoryReviewPlugin()`.
- Types for candidates, governance decisions, retrieval results, review reports, and rendering options.

## Common Usage

```ts
const candidate = createMemoryCandidate({
  id: "mem-1",
  scope: "project",
  kind: "workflow",
  content: "Prefer package-root public APIs in docs.",
  confidence: 0.9,
  importance: 0.7,
  status: "accepted",
  createdAt: new Date().toISOString(),
  sourceRefs: [{ eventId: "event-1" }]
});

const diagnostics = validateMemoryCandidate(candidate);
const block = renderMemoryContextBlock([candidate]);
```

Install the plugin only when a runtime should advertise memory operations:

```ts
const runtime = createAgentRuntime({
  plugins: [createMemoryCandidatesPlugin()]
});
```

## Parameters

- `createMemoryCandidate(input)` requires stable candidate fields: `id`, `scope`, `kind`, `content`, `confidence`, `importance`, `status`, `createdAt`, and at least one `sourceRefs` entry. `confidence` and `importance` are numbers from 0 to 1. `safety` is optional; when provided, it is merged with the package's content scan. `tags` is optional.
- Governance decisions passed to `createMemoryGovernanceLedger(candidates, decisions)` use `id`, `candidateId`, `action`, `decidedAt`, `reviewer`, and `reason`. `itemId` is optional for accepted items, while `supersedesItemId` is required when `action` is `"supersede"`.
- `searchGovernedMemoryItems(items, query, options)` requires `options.scope`. `kind`, `tags`, `includeSuperseded`, and `maxResults` are optional filters and limits.
- Rendering helpers accept optional display controls such as `maxItems`, `maxContentChars`, `includeSourceRefs`, `includeReasons`, `includeTags`, and `title`, depending on the renderer.
- `createMemoryCandidatesPlugin(options)`, `createMemoryGovernancePlugin(options)`, and `createMemoryReviewPlugin(options)` accept optional `pluginId` values for hosts that need stable custom plugin identifiers.

## Notes

- The plugin factories register operation descriptors only; they do not persist memory records.
- Use `@guga-agent/plugin-memory-jsonl` when JSONL persistence is needed.
- Retrieval and rendering helpers operate on governed in-memory data passed by the caller.

## Related Packages

- `@guga-agent/core` supplies operation discovery contracts.
- `@guga-agent/plugin-memory-jsonl` builds persistent JSONL workflows on top of these helpers.
