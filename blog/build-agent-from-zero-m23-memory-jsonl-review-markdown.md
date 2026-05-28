# Build Agent From Zero: M23 Memory JSONL Review Markdown

M23 gives durable memory a readable audit page.

Still no writes. Still no automatic decisions. Just a string a host can show.

## Why This Exists

After M22, a host could ask the JSONL store for a typed review report.

That is the right API for code, but humans often need a quick inspection surface. A CLI, local web page, or desktop panel should not have to duplicate the report-to-Markdown logic.

So M23 adds one convenience method:

`JsonlMemoryStore.readReviewMarkdown()`

## The Composition

The method is deliberately boring:

1. read the durable review report;
2. render it with the canonical M20 renderer;
3. return `{ report, markdown, diagnostics }`.

That composition is the point.

The JSONL package owns durable reading and file diagnostics. The memory-candidates package owns report semantics and Markdown formatting.

## What It Does Not Do

It does not write `MEMORY.md`.

It does not create review decisions.

It does not repair corrupt JSONL.

It does not inject memory into a model prompt.

The Markdown is display output, not a new source of truth.

## Why This Matters

Good agent memory needs operator surfaces.

Before memory becomes more autonomous, it should be easy to inspect what the system thinks is active, unsafe, undecided, rejected, superseded, or broken.

M23 makes that inspection cheap for any host that already has a JSONL memory store.
