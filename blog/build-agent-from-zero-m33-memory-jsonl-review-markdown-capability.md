# Build Agent From Zero: M33 Memory JSONL Review Markdown Capability

M33 makes one display surface explicit.

## Review Data And Review Markdown Are Not The Same

M22 made durable memory review data available.

M23 made durable memory review Markdown available.

Those two outputs are related, but they serve different callers.

Typed review data is good for code.

Markdown is good for humans.

## The Discovery Gap

Before M33, the plugin exposed:

`memory.jsonl.review`

That was useful as a broad review projection descriptor.

But a host that wants a ready-to-render audit view had to know about:

`JsonlMemoryStore.readReviewMarkdown()`

That couples UI discovery to a store method.

## The New Descriptor

M33 adds:

`memory.jsonl.review_markdown`

It is additive.

It is read-only.

It does not replace `memory.jsonl.review`.

This lets a workbench ask a cleaner question: can this plugin provide durable review Markdown?

## The Pattern

Capability discovery should describe meaningful product surfaces, not just storage backends.

When two APIs have different callers, give them separate descriptors.

When one descriptor already exists, keep it stable and add the more specific one beside it.

M33 keeps that promise for durable memory review Markdown.
