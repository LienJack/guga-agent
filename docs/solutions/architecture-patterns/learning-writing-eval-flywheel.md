# Learning Writing Eval Flywheel

M12 turns the roadmap process into a reusable engineering contract.

## Problem

Long agent builds fail quietly when knowledge stays scattered:

- research sits in one folder;
- plans sit somewhere else;
- implementation knowledge lives in commits;
- eval fixtures live inside package tests;
- blog articles drift from the actual architecture;
- the next session has to rediscover the module history.

Guga needs a way for each module to leave behind a path that another agent can follow.

## Decision

Create a small flywheel around every module:

1. research report;
2. brainstorm / PRD;
3. implementation plan;
4. tests and eval fixtures;
5. solution note;
6. module article;
7. Trellis finish/archive.

M12 also adds `@guga-agent/eval-fixtures`, a cross-module registry of hermetic fixtures that reuse the existing eval runner.

## Why This Shape

- **Docs become navigation.** `docs/research/index.md` is now the first stop for module context.
- **Eval is lightweight.** Fixtures use mock providers and metadata, not external services.
- **Failures route to layers.** Fixture metadata names module, category, layer, covered risk, and tags.
- **Writing stays grounded.** Articles use research, plans, and solution notes as source material.
- **The process compounds.** Every future module adds to the same system instead of inventing a one-off wrap-up.

## Current Limits

- No eval dashboard.
- No benchmark scoring.
- No generated fixture corpus from real sessions.
- No automated blog generation.
- No enforcement hook yet for the completion checklist.

## Verification

Focused gates added in this slice:

- Eval fixture manifest coverage tests.
- Fixture metadata validation tests.
- Hermetic suite execution through `runEvalSuite`.
- Research index and article additions verified by full repo gates.
