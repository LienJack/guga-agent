# @guga-agent/plugin-tools-git

Compatibility re-export for the built-in git helper tools.

New first-party code should import from `@guga-agent/core/builtins`.

The implementation registers safe read/assistance helpers: `git_status`, `git_diff`, and `git_commit_message`. It does not expose push, reset, rebase, credential, remote, or history-rewrite automation.

`git_commit_message` prepares text only; it does not run `git commit`.

The implementation lives in `packages/core/src/builtins/git.ts`. This package remains only to avoid breaking older imports.
