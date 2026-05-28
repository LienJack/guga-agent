# Memory JSONL Review Markdown Capability

M33 exposes durable review Markdown as a discoverable read-only capability.

## Problem

`JsonlMemoryStore.readReviewMarkdown()` already provides display-ready audit Markdown, but host surfaces could only discover the broad `memory.jsonl.review` projection.

## Decision

Register `memory.jsonl.review_markdown` from `createMemoryJsonlPlugin()`.

The descriptor:

- is an `operation`;
- is owned by the memory JSONL plugin;
- uses `source: "plugin"`;
- carries first-party read-only memory trust;
- keeps `memory.jsonl.review` unchanged.

## Why This Shape

- **Display shape is explicit.** Hosts can distinguish typed review projection from Markdown audit rendering.
- **Compatibility remains intact.** Existing consumers can keep using `memory.jsonl.review`.
- **No mutation authority.** Markdown review is an audit view, so read-only trust is enough.
- **Descriptor-only growth.** The module improves discovery without adding execution handlers.

## Verification

The plugin descriptor test now includes `memory.jsonl.review_markdown` with the same read-only ownership assertions as other JSONL projection descriptors.
