# M19 Memory Markdown Export Requirements

Date: 2026-05-28

## Problem

Guga can store and retrieve governed memory, but humans still need a readable projection for reviewing active memory outside raw JSONL.

## MVP

- Render active safe governed memory items into Markdown.
- Group by scope and kind.
- Include confidence, importance, tags, and source event references.
- Bound item count and content length.
- Do not write files automatically.

## Non-Goals

- No Markdown parser/importer.
- No automatic `MEMORY.md` mutation.
- No context injection.
- No retrieval or storage changes.

## Acceptance Criteria

- Tests cover grouping, active-safe-only filtering, truncation, source refs, tag rendering, and empty output.
- Focused and full repo gates pass.
- Solution note and article are written.
