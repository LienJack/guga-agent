# @guga-agent/plugin-tools-shell

First-party shell execution tool for Guga runtimes.

The package registers `shell_exec` through the normal plugin context. It is interactive, serial-only, ask-by-default, headless/background denied by default, and uses an allowlisted environment. The local backend runs commands inside the configured workspace root; hosts can replace the backend for sandboxed execution.
