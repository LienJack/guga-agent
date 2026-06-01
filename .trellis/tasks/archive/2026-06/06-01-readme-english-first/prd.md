# docs: English-first README and remove task checklist

## Goal

Create a root project README that presents Guga Agent in English first, then Chinese, and remove the obsolete root `任务.md` checklist from the repository.

## What I Already Know

- The user requested deleting `任务.md`.
- The repository currently has package-level READMEs but no root `README.md`.
- Project documentation guidelines say documentation should be written in English.
- `任务.md` is an old long-running execution checklist and is being removed.

## Requirements

- Delete the root `任务.md` file.
- Add a root `README.md`.
- Put English content before Chinese content in the README.
- Keep the README concise and aligned with the project strategy: small core, plugin ecosystem, CLI-first host protocol, recoverable and auditable agent runtime.

## Acceptance Criteria

- [ ] `任务.md` is removed from git.
- [ ] `README.md` exists at the repository root.
- [ ] The first major README section is English.
- [ ] The Chinese section follows the English section.
- [ ] Git commit is created and pushed to the current branch.

## Out Of Scope

- Changing runtime code.
- Updating package-level READMEs.
- Reworking the roadmap or strategy documents.

## Technical Notes

- Relevant files inspected: `STRATEGY.md`, `docs/roadmap.md`, `packages/core/README.md`, `packages/cli/README.md`, `.trellis/spec/backend/index.md`, `.trellis/spec/guides/index.md`.
