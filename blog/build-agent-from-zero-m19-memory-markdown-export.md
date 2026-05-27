# Build Agent From Zero: M19 Memory Markdown Export

M19 makes memory readable.

Not writable. Not injected. Just readable.

## Why Markdown

Long-term memory eventually needs a human surface.

JSONL is good for machines and audit trails, but it is not the shape a person wants to review before trusting future agent behavior.

Markdown is the bridge: simple, diffable, and easy to inspect.

## Export Before Mutation

Guga still does not write `MEMORY.md`.

That restraint is deliberate.

M19 only renders active governed memory items into Markdown. A host or future review UI can decide what to do with the text.

The runtime does not quietly edit a user profile file.

## What Gets Exported

The exporter groups memory by:

- scope;
- kind.

Each item can include:

- content;
- confidence;
- importance;
- tags;
- source event IDs.

Only active safe governed memory items are rendered.

## Why This Matters

Memory should be inspectable before it is influential.

M19 gives humans a clear view of what the system currently considers stable memory. That makes future steps safer:

- manual review;
- curated file writes;
- import/export workflows;
- context injection.

The important part is that Markdown is a projection, not a hidden source of truth.

The source of truth is still the candidate, decision, and event trail.
