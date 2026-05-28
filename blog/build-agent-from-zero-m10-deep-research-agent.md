# Build Agent From Zero: M10 Deep Research Agent

M10 turns Guga's research rules into software.

The tempting version of a deep research agent starts with search, crawling, subagents, and a big final report. Guga takes the slower-looking but sturdier route: make evidence and source order first-class before adding more autonomy.

## The Move

M10 introduces `@guga-agent/profile-deep-research-agent`.

It is a profile package for evidence-led research. The profile says what a research agent is trying to do, but the package also gives callers typed helpers for the parts that usually get lost in prose:

- which source layer to read first;
- how to sort candidate sources;
- how to record evidence strength;
- how to render the final report;
- how to flag weak research outputs.

## Source Order Is Product Behavior

This repo has a strict rule for reference-agent research: do not start from raw source code.

The new source policy encodes that funnel:

1. context packs;
2. concept graphs;
3. Understand-Anything graphs;
4. source analysis;
5. repomix token trees;
6. repomix packed context;
7. raw source.

That order matters because research quality is not just about finding facts. It is about spending attention in the right order.

## Evidence Before Theater

The evidence ledger has only three strengths:

- `Fact`
- `Inference`
- `Pending Verification`

That is deliberately simple. The point is not to create an academic citation engine. The point is to stop confident prose from hiding uncertainty.

When the report writer renders the final Markdown, it keeps those strengths visible in the `证据` section.

## A Stable Report Shape

Guga research reports now have a reusable structure:

- 一句话结论
- 项目对比
- 可借鉴模式
- 不建议照搬
- Guga 落点
- 证据

That gives later planning modules something dependable to consume. A brainstorm, PRD, or implementation plan can trust that research output has the same landmarks every time.

## CLI Entry

The CLI now accepts:

```bash
guga run "compare agent memory patterns" --mock --profile deep-research
```

Like the code profile, this goes through the same host path. Deep research is a role, not a private runtime.

## What M10 Does Not Do

M10 does not add autonomous web search. It does not spawn subagents. It does not write code. It does not create a vector database.

Those are good future capabilities, but they need a stable evidence contract first. Otherwise the agent can produce more text without producing more trust.

## Result

Guga now has a deep research profile that is small, testable, and opinionated.

It gives the future research agent a spine: source discipline, evidence strength, report consistency, and a clean CLI entry point.
