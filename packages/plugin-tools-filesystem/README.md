# @guga-agent/plugin-tools-filesystem

Compatibility import path for Guga filesystem built-in tools.

The implementation now lives in `@guga-agent/core/builtins`. This package re-exports `createFilesystemPlugin`, `createLocalFilesystemBackend`, and related types so older hosts can migrate incrementally.

The tools remain `fs_read`, `fs_write`, `fs_edit`, `fs_list`, and `fs_search`; paths are contained to a configured workspace root using realpath checks, including symlink escape tests.

New runtime composition should prefer `@guga-agent/core/builtins`.
