# @guga-agent/plugin-tools-git

First-party git helper tools for Guga runtimes.

The package registers safe read/assistance helpers: `git_status`, `git_diff`, and `git_commit_message`. It does not expose push, reset, rebase, credential, remote, or history-rewrite automation.

`git_commit_message` prepares text only; it does not run `git commit`.
