# M23 Memory JSONL Review Markdown Requirements

Date: 2026-05-28

## Problem

M22 gives hosts a typed durable memory review report, but simple host surfaces still need a ready-to-display Markdown string without duplicating report rendering code.

## Requirements

- Add one read-only convenience method on `JsonlMemoryStore`.
- Reuse the canonical M20 Markdown renderer.
- Return JSONL diagnostics and the typed report next to Markdown.
- Preserve partial-tail and corrupt-record behavior.

## Non-Goals

- No writing Markdown files.
- No CLI command.
- No automatic candidate decisions.
