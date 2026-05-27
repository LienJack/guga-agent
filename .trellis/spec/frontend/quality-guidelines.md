# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Future frontend work should be tested as a host projection: user actions must map to typed host commands, and visible state must come from typed events/projections. Visual polish matters, but correctness starts with runtime parity.

---

## Forbidden Patterns

- Do not parse assistant text for run/tool/permission state.
- Do not create a frontend-only agent loop.
- Do not bypass host permission APIs for approve/deny flows.
- Do not hide errors or tool failures without a visible state.
- Do not make layouts that require horizontal scrolling for core workbench controls on normal desktop widths.

---

## Required Patterns

- Render explicit states for running, waiting for permission, canceled, failed, and completed runs.
- Surface tool progress and tool errors as first-class UI rows.
- Keep permission controls reachable and auditable.
- Use stable dimensions for timeline rows, tool controls, and artifact/diff panes.
- Keep text readable and non-overlapping on desktop and mobile breakpoints.

---

## Testing Requirements

When frontend packages are added:

- unit-test protocol projection helpers;
- test command dispatch for permission/cancel/resume/fork actions;
- test unsupported event fallback;
- use browser/screenshot checks for dense workbench layouts and critical controls.

---

## Code Review Checklist

- Does the UI consume typed events/projections instead of guessing from text?
- Are permission and cancel actions routed through host commands?
- Are loading/error/empty states present?
- Does the layout remain usable with long tool names, long paths, and streaming output?
- Are accessibility labels present for icon-only controls?
