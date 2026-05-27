# Build Agent From Zero: The Roadmap That Keeps Working

At some point an agent project stops being one feature.

Guga crossed that line once the core could host plugins, route providers, run tools through permissions, project context, persist sessions, replay events, and expose capability surfaces. After that, the hard problem changed.

It was no longer "can we add one more package?"

It became "can the project keep its shape while the work runs for days?"

## A Roadmap Is Runtime For Humans

A long agent build has the same failure mode as a long agent session: context drifts.

Someone remembers that the core should stay small. Someone else remembers that CLI must be first. Another note says desktop should learn from OpenClaw and Hermes. A plan says code-agent must be a profile, not a core feature. A blog article explains memory, but the task queue points at host protocol.

All of those can be true, and still be unusable if they are not sequenced.

So the roadmap needs to behave like a runtime:

- it has a current baseline;
- it names the next capability;
- it defines allowed effects;
- it records evidence;
- it has a completion protocol.

That is what `任务.md` and `docs/roadmap.md` now do together.

## Two Documents, Two Jobs

`docs/roadmap.md` is the architecture map.

It says what Guga is trying to become: a small core, a plugin ecosystem, a CLI-first host, and eventually a dense desktop workbench. It explains why skills, MCP, capability discovery, host protocol, production operations, code-agent, deep research, and learning/eval belong in that order.

`任务.md` is the execution checklist.

It is deliberately more mechanical. For each module, it asks for requirements, Trellis PRD, research, plan, implementation, tests, review, solution note, blog article, and finish gate.

That repetition is not ceremony. It is how unattended work stays legible.

## The Core Rule

The most important sentence in the roadmap is still simple:

Core stays small.

Code-agent should not smuggle coding policy into core. Desktop should not create a second runtime. Deep research should not invent a separate artifact system. Memory should not bypass events and permissions.

Every professional capability has to arrive as a profile, plugin, host projection, context policy, store, tool bundle, or eval fixture unless it truly belongs to the runtime contract.

That rule is what keeps the system extensible after the first impressive demo.

## Research Before Source

The roadmap also names how research should happen.

Reference projects are useful, but raw source is expensive. Guga now treats research as a funnel:

1. context packs;
2. graphs;
3. architecture analyses;
4. token trees;
5. focused packed context;
6. raw source only when necessary.

That order matters because the goal is not to clone Claude Code, OpenCode, Hermes, DeerFlow, pi, or OpenClaw. The goal is to extract design pressure and then decide what Guga should adopt, adapt, or skip.

## Why Articles Are Part Of Done

A module is not really finished when the tests pass.

Tests protect behavior, but they do not teach the next agent why the module exists. A solution note captures the implementation pattern. A blog article explains the architecture from zero.

That is why every module now ends with writing.

The writing is not marketing. It is compression.

## Result

The roadmap is now executable.

It does not promise that every future decision is already known. It does something more useful: it gives each future module a path from uncertainty to shipped, reviewed, documented, teachable work.

For a long-running agent project, that is the quiet superpower.
