# Add Gemini CLI Reference Corpus

## Goal

Make `/Users/lienli/Documents/GitHub/agent-ref/gemini-cli` usable as a first-class Guga reference object by generating the same lightweight research artifacts used by existing reference projects: Repomix token tree, focused packed context, Graphify graph/report, and a reusable Context Pack.

## What I Already Know

* User explicitly asked to run repomix, Graphify, and Context Packs for `gemini-cli`.
* Existing reference artifacts live under `docs/research/repomix/`, `docs/research/graphs/`, `docs/research/context-packs/`, and `docs/research/intake/source-contract.md`.
* `gemini-cli` is available at `/Users/lienli/Documents/GitHub/agent-ref/gemini-cli`.
* Current `gemini-cli` branch is `main`, commit `5cac7c10fa9ff34e99553057631727c95c1e99f8`.

## Assumptions

* Generate a focused context rather than a full all-source context, matching the approach used for large product-shaped agent repos.
* Include Gemini in the reference corpus without rewriting all existing cross-project context packs.
* Prefer small, queryable artifacts and explicit file lists over broad raw-source reading.

## Requirements

* Generate `docs/research/repomix/gemini-cli-token-tree.txt`.
* Generate a focused packed context for agent core, tools, MCP, skills, config, provider/client, CLI/TUI, prompts, memory/context, and tests where useful.
* Generate Graphify outputs for Gemini and archive JSON/report under `docs/research/graphs/gemini-cli/`.
* Add a Context Pack entry that tells future research agents how to use Gemini CLI as a reference object.
* Update source contract and research index so Gemini is discoverable.

## Acceptance Criteria

* [x] Repomix token tree and focused context files exist and are non-empty.
* [x] Graphify `graph.json` and `GRAPH_REPORT.md` exist and are non-empty.
* [x] Context Pack identifies version, key files, core abstractions, and Guga migration judgement.
* [x] Source contract lists Gemini CLI with path, branch, and commit.
* [x] Final report names generated files and any limitations.

## Out Of Scope

* Deep source-analysis article series for Gemini CLI.
* Updating every existing cross-project context pack with Gemini comparisons.
* Modifying the `gemini-cli` reference repository source code.

## Technical Notes

* Follow `docs/research/reference-project-workflow.md`.
* Follow `.trellis/spec/guides/agent-reference-projects-guide.md`.
* Keep packed context focused to avoid future token bloat.
