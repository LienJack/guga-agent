# M12 Learning Writing Eval Flywheel PRD

## Summary

Build a reusable learning, writing, and eval flywheel for the Guga agent roadmap.

## Goals

- Make module artifacts easier to discover.
- Add hermetic cross-module eval fixtures.
- Fill the M5 article backlog.
- Write the M12 module article.
- Document a repeatable module completion checklist.

## Non-Goals

- No benchmark platform.
- No eval dashboard.
- No external research crawler.
- No image generation.
- No broad rewrite of existing articles.

## Requirements

1. Research index includes completed professional-agent modules and M12.
2. Eval fixtures are hermetic, metadata-rich, and runnable through the existing eval runner.
3. Fixture metadata maps each case to module, category, covered risk, and layer.
4. M5 has a module article.
5. M12 has a module article.
6. A solution note explains the flywheel contract.

## Acceptance

- Focused package tests pass.
- Full repo tests, typecheck, and build pass.
- Trellis context validates.
