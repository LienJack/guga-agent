# Build Agent From Zero: M9 Code Agent

M9 is where Guga starts to feel like a coding agent without becoming a code-agent-only runtime.

That distinction matters. A coding agent needs file tools, shell, git, permissions, repo context, tests, and a CLI path. But none of those require the core loop to know it is doing coding work.

## The Move

M9 introduces `@guga-agent/profile-code-agent`.

It is a profile package: a small bundle of metadata, prompt guidance, permission defaults, plugins, repo context helpers, and test discovery helpers.

The core runtime stayed untouched.

## What The Profile Owns

The profile owns coding defaults:

- understand the repo before editing;
- prefer existing patterns;
- use filesystem, shell, and git tools through plugins;
- ask before write or execute actions;
- deny obviously destructive shell commands;
- suggest focused verification commands from package scripts and changed files.

It does not own execution. The agent loop, tool runtime, permission kernel, event bus, host protocol, and CLI runner remain the same shared platform.

## Bundle First

The code profile composes existing first-party packages:

- filesystem tools;
- shell tool;
- git tools;
- ops health;
- audit export;
- eval runner.

This is the payoff from earlier modules. M6 gave capability discovery. M7/M11 gave host and CLI. M8 gave operations. M9 can now be mostly assembly, policy, and product shape.

## CLI Entry

The CLI now supports:

```bash
guga run "summarize this repo" --mock --profile code
```

Unknown profiles fail fast. The code profile still goes through the host SDK path, so it does not become a private shortcut.

## Why This Matters

Many agent projects accidentally make their first product workflow the architecture. Guga avoids that here.

Code Agent is a role. Runtime is the platform.

That means future roles such as research, review, browser automation, or desktop workbench agents can use the same pattern: profile package first, core change only when a stable shared contract is missing.

## Result

M9 gives Guga a coding-agent entry point that is useful, testable, and still humble. It can grow into Claude Code/OpenCode territory, but it starts from composition instead of a monolith.
