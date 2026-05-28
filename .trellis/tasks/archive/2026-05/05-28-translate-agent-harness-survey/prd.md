# Translate agent harness survey

## Goal

Translate `docs/research/papers/agent-harness-engineering-a-survey.md` into Chinese while preserving the Markdown structure, links, page markers, citations, and technical terminology where appropriate.

## What I already know

* User asked: `agent-harness-engineering-a-survey.md 翻译成中文`.
* Source file is `docs/research/papers/agent-harness-engineering-a-survey.md`.
* The document is long: 4105 lines.

## Assumptions

* Create a sibling Chinese Markdown file instead of overwriting the English source.
* Keep source URLs, local PDF references, citations, tables, and code-like identifiers unchanged unless translation is clearly expected.

## Requirements

* Translate prose and headings to Simplified Chinese.
* Preserve Markdown syntax and document structure.
* Preserve page comments like `<!-- page 1 -->`.
* Preserve citations and bibliography identifiers.
* Keep domain terms readable, using English in parentheses when helpful.

## Acceptance Criteria

* [x] A Chinese Markdown translation exists under `docs/research/papers/`.
* [x] The translated file has the same major section structure as the source.
* [x] Source links and local PDF paths remain present.
* [x] The translation reaches the end of the source document.

## Out of Scope

* Re-validating the paper's claims.
* Rebuilding tables or figures beyond preserving extracted Markdown text.
* Editing the original PDF.

## Technical Notes

* This is a documentation-only task.
* Translation will be generated in chunks because the source is too large for a single manual edit.
