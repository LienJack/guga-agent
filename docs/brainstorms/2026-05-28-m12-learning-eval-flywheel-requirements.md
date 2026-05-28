---
date: 2026-05-28
topic: m12-learning-writing-eval-flywheel
---

# M12 Learning / Blog / Eval Flywheel Requirements

## Summary

M12 turns the long-running agent build into a reusable learning system. The work is not another core runtime feature; it is the connective tissue that lets future sessions understand what each module did, why it exists, where its evidence lives, how to evaluate it, and which article explains it from first principles.

## Problem

M6-M10 now have implementation slices, solution notes, and module articles. M5 still lacks the required blog article, `docs/research/index.md` only partially indexes the newer modules, and the eval runner has fixture mechanics but no cross-module fixture catalog.

Without a flywheel, future modules will repeat discovery work:

- agents will reread scattered docs to learn what has shipped;
- module completion will depend on memory instead of a checklist;
- eval scenarios will live inside plugin tests instead of a reusable suite;
- the "build agent from zero" series will drift in naming and structure.

## Goals

- Add an M12 research report and plan.
- Update the research index so M6-M12 can be found from one table.
- Add a reusable eval fixture registry that covers the roadmap scenarios.
- Fill the M5 blog backlog.
- Add an M12 article explaining the learning/eval flywheel itself.
- Document the completion checklist and artifact contract.

## Non-Goals

- No eval dashboard.
- No benchmark scoring platform.
- No external search automation.
- No generated blog images in this slice.
- No rewriting existing module articles unless needed for link consistency.

## Requirements

- R1. Every completed module from M5 through M12 must have a discoverable research, plan, solution or blog artifact entry.
- R2. The research index must include module question, references, Adopt/Adapt/Skip summary, output document, and next plan.
- R3. Eval fixtures must be hermetic and use mock provider responses.
- R4. Eval fixture metadata must identify module, category, covered risk, and owned layer.
- R5. The fixture registry must be testable as a package and runnable through the existing eval runner.
- R6. The M5 article must explain session/event/artifact/replay as a durable substrate, not as a memory feature.
- R7. The M12 article must explain why learning artifacts, blogs, and evals are one workflow.
- R8. The module completion checklist must be documented as a reusable contract.

## Acceptance

- `@guga-agent/eval-fixtures` exports fixture metadata and a manifest.
- Fixture tests prove category coverage, unique ids, metadata quality, and suite pass.
- `docs/research/index.md` includes M9, M10, M12 and keeps M6-M8 discoverable.
- `blog/build-agent-from-zero-m5-session-store-replay.md` exists.
- `blog/build-agent-from-zero-m12-learning-eval-flywheel.md` exists.
- Full repo `test`, `typecheck`, and `build` pass.
