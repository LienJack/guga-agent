# Memory JSONL Retrieval

Date: 2026-05-28

## 一句话结论

M26 should expose durable memory retrieval from `JsonlMemoryStore` by composing the existing JSONL governance read path with M18's scope-required lexical retrieval.

## Evidence

- `Fact`: M17 stores memory candidates and governance decisions as append-only JSONL, then rebuilds the governed ledger on read.
- `Fact`: M18 defines deterministic retrieval over governed items with explicit scope, active-safe defaults, filters, result scores, and explainable reasons.
- `Fact`: M22-M25 show the JSONL store should provide common read projections by composing existing memory candidate package functions.
- `Inference`: Durable retrieval belongs as a read-only convenience at the JSONL edge, while retrieval semantics remain owned by `@guga-agent/plugin-memory-candidates`.

## Guga Landing

Add `JsonlMemoryStore.readRetrieval(query, options)`.

The method should:

- call `readGovernanceLedger()`;
- fail closed on corrupt JSONL;
- search `ledger.items` with `searchGovernedMemoryItems()`;
- return `{ response, diagnostics }` on successful reads;
- preserve recoverable JSONL diagnostics such as partial tails.

## Guardrails

- Keep scope required by the retrieval options.
- Do not duplicate retrieval scoring in the JSONL package.
- Do not render or inject retrieved memory unless a caller explicitly asks in a later module.
- Do not repair or truncate JSONL in this module.
