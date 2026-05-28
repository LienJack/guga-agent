# Build Agent From Zero: Agent Harness Is The Real System

The harness survey is useful because it names something builders learn the hard way.

An agent is not just a model call with a better prompt. Once it can use tools, run commands, write files, browse, evaluate results, remember state, or ask for permissions, the important system is the wrapper around the model.

That wrapper is the harness.

## The Seven Questions

The survey's ETCLOVG taxonomy is a compact checklist:

1. Where do actions execute?
2. Which tools exist, and how are they described?
3. What context does the model see at each step?
4. How does the task move through its lifecycle?
5. How do we observe what happened?
6. How do we verify the result?
7. How do we govern risk, permission, and accountability?

For Guga, this maps almost directly onto the roadmap:

- execution and tools become plugins;
- context becomes projection policy;
- lifecycle becomes the runtime loop and host protocol;
- observability becomes events, replay, and audit;
- verification becomes tests and eval fixtures;
- governance becomes permission runtime and capability scopes.

## Why This Matters

The model proposes actions. The harness decides how those actions happen in the world.

That distinction keeps Guga honest. A code-agent should not be a giant prompt that hopes the model behaves. It needs file tools, shell tools, git tools, permission decisions, test feedback, resumable state, and review gates. A deep-research agent needs evidence ledgers, source policy, report artifacts, and verification. A desktop workbench needs event projections, permission queues, and artifact viewers.

Those are harness concerns.

## The Design Pressure

The survey also explains why agent infrastructure feels coupled.

A stronger sandbox affects permissions. A richer context policy affects cost. A broader tool menu affects governance. Better verification changes lifecycle timing. More observability changes what can be replayed and debugged.

No layer is isolated for long.

That is why Guga keeps the core small but makes the contracts explicit. Core owns the stable runtime facts; plugins and profiles own the specialized behavior.

## Result

The translated survey and the companion Chinese guide give future Guga modules a shared vocabulary.

When a module gets blurry, we can ask a simple question: which harness layer is this really about?
