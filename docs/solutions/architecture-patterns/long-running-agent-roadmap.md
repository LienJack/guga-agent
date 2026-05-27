# Long Running Agent Roadmap

The roadmap task turns an open-ended agent build into a repeatable module contract.

## Problem

Guga is now bigger than a single core spike. The project has a small runtime core, first-party plugins, session replay, capability discovery, host protocol work, memory modules, and future professional agents. Without a written execution contract, the next session can easily confuse these layers:

- roadmap vision;
- current implemented baseline;
- module order;
- research evidence;
- Trellis task lifecycle;
- article and solution follow-through;
- boundaries that keep code-agent and desktop concerns out of core.

The risk is not lack of ideas. The risk is losing sequence.

## Decision

Use two living documents as the durable control surface:

- `任务.md` is the executable checklist for review and unattended execution.
- `docs/roadmap.md` is the architectural map that explains why the modules are ordered.

Each large module follows the same closure loop:

1. requirements and Trellis PRD;
2. research report;
3. implementation plan;
4. narrow implementation and tests;
5. review;
6. solution note;
7. blog article;
8. Trellis archive.

## Why This Shape

- **The queue stays visible.** A future agent can inspect unchecked items without reconstructing intent from chat.
- **Core pressure is controlled.** The documents repeat that provider, tools, skills, MCP, context, memory, CLI, workbench, code-agent, and deep-research behavior belong outside core unless they are true runtime contracts.
- **Research has a path.** The 7-layer funnel prevents premature raw-source spelunking and keeps evidence reusable.
- **Writing becomes a gate.** The article requirement forces every module to become teachable before it is considered complete.
- **Unattended work has guardrails.** The module loop gives autonomous runs a way to keep progressing while preserving unrelated dirty work.

## Current Limits

- The roadmap does not automatically enforce checkboxes.
- The Trellis queue still contains older active tasks that need separate closure.
- The roadmap can identify OpenClaw and Hermes as references, but module-specific research must still confirm versions and source anchors.
- Multi-agent execution still requires the main agent to assign non-overlapping work and integrate results.

## Verification

This task is documentation-only. The useful checks are:

- Trellis task validation;
- Markdown artifact existence;
- scoped git diff review;
- full repository test, typecheck, and build gates to ensure no accidental code breakage.
