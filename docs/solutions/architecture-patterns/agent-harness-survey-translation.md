# Agent Harness Survey Translation

The harness survey translation turns a long external paper into local research material for future Guga modules.

## Problem

Guga's roadmap depends on agent harness concepts: execution environments, tools, context, lifecycle, observability, verification, and governance. The source paper is long, PDF-derived, and awkward to consume during planning. If the paper stays only as an English PDF extraction, future sessions will repeatedly pay the same reading cost.

## Decision

Keep the English source, local PDF, project-page notes, and Chinese translation together under `docs/research/papers/`.

The translation preserves:

- Markdown structure;
- page comments;
- links and local PDF references;
- citations and project names;
- the appendix through page 71.

An additional Chinese guide, `agent-harness-engineering-how-to-write-a-harness.zh.md`, turns the survey's taxonomy into a practical implementation checklist.

## Why This Shape

- **Research stays reusable.** The translated paper becomes a source for M7/M11 host work, M8 operations, M9 code-agent, M10 deep research, and permission/runtime design.
- **Original evidence remains nearby.** The PDF and English extraction are committed beside the Chinese version.
- **The guide bridges paper and implementation.** Future planning can start from the engineering checklist instead of re-summarizing the whole paper.

## Current Limits

- The translation is generated from PDF-extracted Markdown, so tables and multi-column regions may still need manual cleanup before citation.
- The Chinese prose is suitable for local study, not publication-quality academic translation.
- The task does not validate every claim in the paper against original project sources.

## Verification

Verification is documentation-oriented:

- Trellis context validation passed.
- The translated file reaches page 71 and the reference harness appendix.
- Source and translated files keep page markers, links, and PDF references.
- Full repository test, typecheck, and build gates passed after the translation artifacts were present.
