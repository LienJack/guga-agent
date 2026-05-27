# Prepare memory reference research packs

## Goal

Build a reusable research corpus for the memory reference projects `graphiti`, `mem0`, and `zep`: Repomix outputs first, Graphify graphs second, then small Context Packs for later Guga technical research.

## What I Already Know

- User provided local project roots under `/Users/lienli/Documents/GitHub/memo-ref/`.
- Target projects are `graphiti`, `mem0`, and `zep`.
- Existing Guga research workflow stores Repomix artifacts under `docs/research/repomix/` and reusable packs under `docs/research/context-packs/`.
- Existing research guidance says token trees are for locating candidate files, Graphify is a navigation layer, and Context Packs should be small enough to reuse in future research.

## Assumptions

- Full token trees should cover each repo broadly.
- Packed Repomix contexts should exclude lockfiles, binaries, generated caches, build outputs, and large media unless later research needs them.
- Graphify outputs can be generated per reference repo and mirrored into `docs/research/graphs/<project>/` for discoverability.
- Context Packs should focus on memory architecture and project comparison, not perform a complete design analysis yet.

## Requirements

- Generate or refresh Repomix token tree files for `graphiti`, `mem0`, and `zep`.
- Generate or refresh packed Repomix context files for each project.
- Generate Graphify graph artifacts for each project.
- Create reusable Context Packs for later memory-system research.
- Update research index/build-status files so future sessions can find the artifacts.

## Acceptance Criteria

- [x] `docs/research/repomix/*` contains memory project token trees and contexts.
- [x] `docs/research/graphs/*` contains Graphify outputs or documented pointers for the three projects.
- [x] `docs/research/context-packs/*` contains memory-focused packs with evidence pointers.
- [x] Research index/build-status documents mention the new memory reference corpus.

## Out of Scope

- No changes to runtime code.
- No final architecture decision for Guga memory implementation in this task.
- No exhaustive raw-source analysis beyond producing reusable research artifacts.

## Technical Notes

- Follow `.trellis/spec/guides/agent-reference-projects-guide.md`.
- Follow `docs/research/reference-project-workflow.md`.
- Use `repomix` from local PATH.
- Use `graphify` from local PATH / Python package where available.
- Graphify Python extraction required a temporary `tree-sitter>=0.25.0` upgrade to generate Python-heavy `graphiti`; after graph generation, the global package was restored to `tree-sitter==0.24.0` to avoid conflicting with `aider-chat`.
- `mem0` Graphify graph is too large for HTML visualization, so only `graph.json` and `GRAPH_REPORT.md` are retained under `docs/research/graphs/mem0/`.
