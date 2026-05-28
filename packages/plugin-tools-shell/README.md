# @guga-agent/plugin-tools-shell

Compatibility re-export for the built-in shell execution tool.

New first-party code should import from `@guga-agent/core/builtins`.

The implementation registers `shell_exec` through the normal plugin context. It is interactive, serial-only, ask-by-default, headless/background denied by default, and uses an allowlisted environment. The local backend runs commands inside the configured workspace root; hosts can replace the backend for sandboxed execution.

The implementation lives in `packages/core/src/builtins/shell.ts`. This package remains only to avoid breaking older imports.
