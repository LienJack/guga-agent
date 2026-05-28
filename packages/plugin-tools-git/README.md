# @guga-agent/plugin-tools-git

Compatibility import path for Guga git built-in tools.

The implementation now lives in `@guga-agent/core/builtins`. This package re-exports `createGitPlugin`, `createLocalGitBackend`, and related helpers so older hosts can migrate incrementally.

The tools remain safe read/assistance helpers: `git_status`, `git_diff`, and `git_commit_message`. They do not expose push, reset, rebase, credential, remote, or history-rewrite automation.

`git_commit_message` prepares text only; it does not run `git commit`.

New runtime composition should prefer `@guga-agent/core/builtins`.
