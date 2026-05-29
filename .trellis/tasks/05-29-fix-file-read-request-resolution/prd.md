# Fix file read request resolution

## Goal

When a user asks the code agent to read a named project document such as "read the README", the agent should find the intended workspace document and return file content instead of falling back to a broad file list. File discovery must stay bounded to the workspace and present concise, relative paths.

## What I already know

- The current core filesystem built-in has separate `fs_read`, `fs_list`, and `fs_search` tools.
- `fs_read` resolves only exact paths, so `readme` does not resolve to `README.md`.
- `fs_search` returns absolute paths for all substring matches, which makes fallback search noisy and can expose path lists instead of content.
- This repository currently has package README files but no root `README.md`.
- Reference findings:
  - Pi's `find` returns paths relative to the search directory and `read` returns content directly.
  - Claude Code provides friendly similar-path guidance for missing read targets.
  - Gemini CLI keeps read-file and glob/list semantics distinct and workspace-bounded.

## Requirements

- `fs_read` should resolve common extension/case variants for explicit document requests, including `readme` -> `README.md` when a matching file exists in the requested directory.
- If a read target is missing but has a small set of likely workspace document matches, return a structured file-not-found error with concise relative suggestions.
- If the target is ambiguous, do not return a huge list; provide a bounded candidate list and ask for a more specific path.
- `fs_search` should return workspace-relative paths, not absolute paths.
- All path resolution must remain workspace-bounded and symlink-safe.

## Acceptance Criteria

- [ ] Reading `readme` succeeds when `README.md` exists in the workspace root.
- [ ] Reading `README.md` in a workspace without a root README returns a concise not-found error with package README suggestions.
- [ ] Searching for `README` returns relative paths only.
- [ ] Existing exact read behavior still works.
- [ ] Focused tests pass for core built-ins.

## Out of Scope

- Adding a natural-language intent parser.
- Creating a root README for this repository.
- Changing provider/model behavior.
- Changing CLI/TUI workbench behavior.

## Technical Notes

- Main implementation target: `packages/core/src/builtins/filesystem.ts`.
- Existing tests: `packages/core/src/builtins/default-core-capabilities.test.ts`.
- Specs read: backend directory structure, backend quality, backend error handling, shared thinking guides.
