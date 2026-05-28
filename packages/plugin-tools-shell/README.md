# @guga-agent/plugin-tools-shell

Compatibility import path for Guga shell built-in tools.

The implementation now lives in `@guga-agent/core/builtins`. This package re-exports `createShellPlugin`, `createLocalShellBackend`, and related helpers so older hosts can migrate incrementally.

The `shell_exec` tool remains interactive, serial-only, ask-by-default, headless/background denied by default, and uses an allowlisted environment. The local backend runs commands inside the configured workspace root; hosts can replace the backend for sandboxed execution.

New runtime composition should prefer `@guga-agent/core/builtins`.
