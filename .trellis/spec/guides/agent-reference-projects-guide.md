# Agent Reference Projects Guide

> **Purpose**: Define how to interpret and use the project's agent reference corpus.

---

## Research Phrase Contract

During research, planning, roadmap, architecture analysis, or design comparison, when the user says **"参考全项目"**, **"参考全项目代码"**, **"按全项目参考"**, or similar wording, interpret it as:

> Use **all reference projects under `/Users/lienli/Documents/GitHub/agent-ref`** as the comparison set.

This phrase does **not** mean only the current `guga-agent` repository, only the `docs/` directory, or only one named reference project.

This is a **research-scope phrase**, not an automatic implementation requirement. Do not scan every reference repo during routine coding unless the user asks for research or the implementation decision genuinely depends on cross-project comparison.

## Fast Research Entry Point

Before reading raw reference repositories, first inspect the prepared research artifacts in this repo:

```bash
docs/research/intake/source-contract.md
docs/research/repomix/
```

Use these files first because they provide:

- the reference project list and version anchors;
- token-tree snapshots for quick code layout study;
- packed context files for targeted source review;
- previously extracted architecture notes.

Only open raw files under `/Users/lienli/Documents/GitHub/agent-ref/<project>` when the prepared research artifacts are insufficient or when line-level verification is needed.

## Current Full-Project Reference Set

The current "全项目" set is:

- `blade-agent-sdk`
- `blade-code`
- `cc-haha`
- `deepagentsjs`
- `deer-flow`
- `hermes-agent`
- `opencode`

The canonical path is:

```bash
/Users/lienli/Documents/GitHub/agent-ref
```

The source contract is:

```bash
docs/research/intake/source-contract.md
```

## Recommended Reading Order

For architecture, roadmap, or implementation planning:

1. Read `docs/research/intake/source-contract.md`.
2. Read relevant `docs/research/repomix/*-token-tree.txt` files to understand code layout.
3. Read topic docs in `docs/agent-*.md` if they cover the requested topic.
4. Read relevant `docs/research/repomix/*-context*.xml` only for source-level confirmation.
5. Read raw reference repo files only when a claim needs direct verification.

## Topic Routing

- Agent loop / ReAct runtime: start with `blade-agent-sdk`, `blade-code`, `opencode`, then `hermes-agent`.
- Tool registry / execution / permissions: start with `blade-agent-sdk`, `blade-code`, `opencode`, then `hermes-agent`.
- Context / compaction / session recovery: start with `blade-code`, `opencode`, `deepagentsjs`, then `hermes-agent`.
- LLM provider abstraction: start with `opencode`, `blade-agent-sdk`, `deer-flow`, then `hermes-agent`.
- UI / protocol / remote clients: start with `opencode`, `deer-flow`, `cc-haha`, `blade-code`, then `hermes-agent`.
- Core package / reusable SDK layout: start with `blade-agent-sdk` and `deepagentsjs`; use `opencode` and `hermes-agent` for later platform shape.

## Output Expectations

When using "参考全项目" in research output:

- Name which reference projects influenced the decision.
- Distinguish facts from inferences when making architectural claims.
- Prefer repo-relative references for files in this repo.
- Use absolute reference paths only when pointing to files in `/Users/lienli/Documents/GitHub/agent-ref`.
- Do not copy a reference project's structure wholesale; extract the boundary pattern and explain why it fits Guga Agent.
- If the final output is an implementation plan, summarize the relevant reference findings before prescribing the Guga-specific layout or approach.

## Common Mistakes

- Treating "全项目" as only the current repo.
- Jumping directly into raw reference repos before checking `docs/research`.
- Copying `opencode`'s mature monorepo shape before Guga has a stable core package.
- Treating `hermes-agent` as the minimum implementation shape; it is better used as a commercial platform pressure sample.
- Using `cc-haha` as agent core reference; it is primarily useful for remote/client protocol behavior.
