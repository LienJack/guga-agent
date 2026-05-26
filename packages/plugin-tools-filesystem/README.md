# @guga-agent/plugin-tools-filesystem

First-party filesystem tools for Guga runtimes.

The package registers `fs_read`, `fs_write`, `fs_edit`, `fs_list`, and `fs_search` through the normal plugin context. Paths are contained to a configured workspace root using realpath checks, including symlink escape tests.

`@guga-agent/core` does not import this package. Hosts opt in with `createFilesystemPlugin({ workspaceRoot })`.
