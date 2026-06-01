# Document package APIs

## Goal

Add a non-README usage/API document for every package under `packages/`, so contributors can quickly understand what each package is for, how to use it, and what public APIs it exposes.

## What I Already Know

- The user asked for one additional document per package, separate from README.
- The repository contains 25 packages under `packages/*/package.json`.
- The docs should explain package usage and APIs, not change runtime behavior.
- Existing user changes include deleted image files at the repository root; this task must not touch or revert them.

## Requirements

- Create a package-level usage/API document for each package under `packages/`.
- Create a Chinese package-level usage/API document for each package under `packages/`.
- Include parameter explanations for the main public APIs, plugin factories, tool inputs, and CLI commands.
- Keep docs concise and consistent across packages.
- Prefer facts from package metadata, source exports, tests, and existing README files.
- Do not edit package runtime code unless required to make docs accurate.

## Acceptance Criteria

- [x] Every `packages/*/package.json` directory has a non-README usage/API document.
- [x] Every `packages/*/package.json` directory has a Chinese non-README usage/API document.
- [x] English and Chinese usage/API documents include parameter explanations.
- [x] Each document includes purpose, installation/import guidance where applicable, main APIs/entry points, common usage, and related packages.
- [x] Documentation is internally consistent and does not claim APIs that are not exported.
- [x] Repository checks relevant to docs pass or are reported if unavailable.

## Out of Scope

- Changing package public APIs.
- Rewriting existing READMEs.
- Publishing generated API reference from TypeDoc.

## Technical Notes

- Package discovery command: `find packages -maxdepth 2 -name package.json -print | sort`.
- Trellis package specs are not configured for this repo; use repository source and existing docs as the source of truth.
