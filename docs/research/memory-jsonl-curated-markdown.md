# Memory JSONL Curated Markdown

Date: 2026-05-28

## 一句话结论

M27 should expose durable curated-memory Markdown from `JsonlMemoryStore` by composing the existing JSONL governance read path with M19's active-safe Markdown renderer.

## Evidence

- `Fact`: M17 stores memory candidates and governance decisions as append-only JSONL and rebuilds governed memory on read.
- `Fact`: M19 renders active safe governed memory items into bounded Markdown without writing files.
- `Fact`: M22, M23, M25, and M26 established that JSONL store read helpers should compose canonical memory package projections rather than reimplementing semantics.
- `Inference`: A durable store convenience method reduces host duplication while keeping formatting rules owned by `@guga-agent/plugin-memory-candidates`.

## Guga Landing

Add `JsonlMemoryStore.readCuratedMarkdown(options)`.

The method should:

- call `readGovernanceLedger()`;
- fail closed on corrupt JSONL;
- render `ledger.items` with `renderCuratedMemoryMarkdown()`;
- return `{ ledger, markdown, diagnostics }` for successful reads;
- preserve recoverable JSONL diagnostics such as partial tails.

## Guardrails

- Do not write Markdown files in this module.
- Do not inject curated memory into model context.
- Keep active/safe filtering and grouping behavior in the canonical renderer.
- Keep JSONL corruption and partial-tail semantics in the JSONL package.
