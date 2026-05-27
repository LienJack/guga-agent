# Build Agent From Zero: M12 Learning Eval Flywheel

M12 is about what remains after a module is done.

Code matters, obviously. But in a long agent build, code without memory turns into archaeology. Every future session has to rediscover why a package exists, what tradeoffs shaped it, where the tests are, and how to explain the module to another human.

M12 turns that residue into a system.

## The Problem

Guga now has real modules:

- plugin host and hooks;
- provider bridge;
- tool permissions;
- context policies;
- session replay;
- skills and MCP;
- host protocol;
- production ops;
- code agent;
- deep research agent.

The risk is no longer "can we build another feature?" The risk is that the knowledge trail gets thin.

If a future agent cannot quickly answer these questions, the project slows down:

- What problem did this module solve?
- What did we explicitly defer?
- Which references shaped the design?
- What tests protect it?
- Which article explains it from zero?
- What eval fixture catches a regression?

M12 makes those questions first-class.

## The Move

The flywheel has seven parts:

1. research;
2. brainstorm / PRD;
3. plan;
4. implementation and tests;
5. solution note;
6. blog article;
7. Trellis finish/archive.

This sounds process-heavy until you treat it as compression. Each artifact saves the next session from rereading the whole repository.

Research explains why. The plan explains how. Tests protect behavior. The solution note captures the pattern. The blog teaches the module from first principles.

## Eval Joins The Loop

M8 added a small eval runner. M12 gives it a roadmap-level registry:

`@guga-agent/eval-fixtures`

The package exports hermetic mock-provider fixtures for the current product surfaces:

- M6 capability discovery;
- M7/M11 host protocol;
- M8 production operations;
- M9 code agent profile;
- M10 deep research profile.

Each fixture carries metadata:

- module;
- category;
- layer;
- covered risk;
- tags.

That metadata is the important part. A failing fixture should point toward a layer: provider, tool, context, permission, session, protocol, or profile.

These fixtures are not benchmarks. They are small tripwires.

## Blogs Are Not Changelogs

The "Build Agent From Zero" series has a specific job.

It should not be an API reference. It should not be a release note. It should explain why a module had to exist.

The recurring shape is:

```text
why this module appears
-> what problem it solves
-> what boundary it refuses
-> what minimal implementation proves it
-> what pressure remains for the next module
```

That shape keeps the writing useful to someone learning agent architecture, not just someone reading commit history.

## The Index Matters

`docs/research/index.md` is now a navigation surface.

It records module questions, references, output docs, and Guga decisions. That makes it the first place a future agent can land before touching raw source or guessing from package names.

This is quiet infrastructure, but it matters. Long tasks do not stay coherent by accident.

## Result

M12 makes Guga easier to continue.

The project now has a stronger loop:

```text
build the module
-> verify the behavior
-> record the decision
-> teach the module
-> seed the eval
-> archive the task
```

That is the learning flywheel. Not fancy, not loud, but exactly the kind of structure that lets a long agent build keep compounding instead of shedding context every night.
