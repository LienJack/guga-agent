# Memory Review Health

Date: 2026-05-28

## 一句话结论

M24 should add a deterministic health signal on top of memory review reports so hosts can gate display and operator workflows without inventing their own severity rules.

## Evidence

- `Fact`: M20 reports counts and queues but does not compute an overall status.
- `Fact`: M22/M23 make the report available from durable JSONL and Markdown surfaces.
- `Inference`: A tiny health summary prevents each host from treating unsafe, diagnostic, and undecided states differently.

## Guga Landing

Add:

- `createMemoryReviewHealth(report)`
- `renderMemoryReviewHealthBlock(health)`

Status rules:

- `blocked`: unsafe candidates or governance diagnostics exist.
- `needs_review`: no blocked condition, but undecided candidates exist.
- `healthy`: no blocked condition and no undecided candidates.

Rejected and superseded memory remains informational.

## Guardrails

- Health is an audit signal, not a decision engine.
- Do not mutate memory state.
- Do not couple health to JSONL storage or host UI.
