# M20 Memory Review Report Requirements

Date: 2026-05-28

## Problem

M15-M19 can propose, govern, persist, retrieve, and export memory items. The missing operator view is an audit summary that answers: what is active, what was rejected or superseded, what still needs review, and whether unsafe or invalid records are present.

## Requirements

- Build from the existing governance ledger instead of rereading storage directly.
- Make counts machine-readable for tests and future UI surfaces.
- Keep review queues deterministic and bounded.
- Render Markdown for humans.
- Preserve the safety posture: unsafe candidates are reported, not rendered as usable memory.

## Non-Goals

- Do not mutate candidates, decisions, JSONL files, or Markdown files.
- Do not make review decisions automatically.
- Do not change retrieval scoring.
