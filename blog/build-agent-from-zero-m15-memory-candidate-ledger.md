# Build Agent From Zero: M15 Memory Candidate Ledger

M15 adds memory without adding memory.

That sounds slippery, but it is the whole point.

## The Problem

Long-term memory is one of the easiest ways to make an agent feel useful and one of the easiest ways to make it impossible to audit.

If an agent quietly writes facts about the user, the project, or its own decisions, then later injects those facts into prompts, a simple question appears:

Where did this belief come from?

If the answer is "some memory store", the runtime has lost the thread.

## The Move

M15 introduces `@guga-agent/plugin-memory-candidates`.

It does not write `MEMORY.md`.

It does not call a vector database.

It does not inject retrieved context into the model.

It represents proposed memory as a candidate:

- scope;
- kind;
- content;
- confidence;
- importance;
- status;
- source references;
- safety verdict.

That is the smallest honest memory layer.

## Source Of Truth

The original event log remains the source of truth.

A memory candidate points back to events, runs, turns, sessions, and artifacts. It is a projection over facts, not a new hidden fact store.

This matters because replay and audit should be able to answer why a candidate exists.

## Safety First

Before rendering a memory candidate, M15 scans for:

- prompt-injection-like content;
- invisible control characters;
- excessive length.

Only `accepted` candidates with `safe` verdicts are rendered into a context block.

That gives future context-policy plugins a clean input: they can consume a bounded safe block rather than raw memory fragments.

## Why Not Retrieval Yet

Graph memory, vector search, entity extraction, reranking, and user profiles are all real features.

They are just not the first step.

The first step is the governance object: the thing a future memory system must produce before it is allowed to become prompt context.

## What Comes Later

M15 leaves room for:

- automatic extraction with review gates;
- `MEMORY.md` / `USER.md` projections;
- vector or graph search;
- context-policy injection;
- host UI for accepting or rejecting candidates.

But those future systems will have to pass through the candidate ledger.

Good. Memory should earn its way into the prompt.
