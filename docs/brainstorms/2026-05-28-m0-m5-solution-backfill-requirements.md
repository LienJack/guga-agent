---
date: 2026-05-28
topic: m0-m5-solution-backfill
---

# M0-M5 Solution Backfill Requirements

## Summary

Backfill solution notes for M0-M5 so the early runtime modules have the same reusable architecture memory as M6-M12.

## Problem

The later roadmap modules already have `docs/solutions/architecture-patterns/*` entries. M0-M5 have strong plans and articles, but their reusable decision records are missing. That leaves the early architecture history split across long blog posts and implementation plans.

## Goals

- Add solution notes for M0 through M5.
- Update the research index so M0-M12 are all visible.
- Keep the notes concise and pattern-oriented.
- Do not rewrite early code or blogs.

## Requirements

1. M0 records the minimal core loop pattern.
2. M1 records local plugin host and hook kernel boundaries.
3. M2 records provider bridge and router separation.
4. M3 records core-owned tool execution and permission runtime.
5. M4 records model-input projection and context policy plugin boundaries.
6. M5 records durable session store and replay substrate.
7. `docs/research/index.md` includes M0-M4 module rows.

## Acceptance

- Six new solution notes exist under `docs/solutions/architecture-patterns/`.
- Research index covers M0-M12.
- Trellis context validates.
