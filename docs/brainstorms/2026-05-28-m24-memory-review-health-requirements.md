# M24 Memory Review Health Requirements

Date: 2026-05-28

## Problem

M20-M23 provide detailed memory audit reports and Markdown surfaces, but host code still has to infer whether the memory system is healthy, merely needs human review, or is blocked by unsafe/invalid records.

## Requirements

- Add one deterministic summary function over `MemoryReviewReport`.
- Keep the status vocabulary small: healthy, needs_review, blocked.
- Surface stable reason codes for UI, CLI, and tests.
- Render a compact Markdown block.

## Non-Goals

- No automatic candidate decisions.
- No JSONL or Markdown writes.
- No UI or CLI command.
