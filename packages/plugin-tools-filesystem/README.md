# @guga-agent/plugin-tools-filesystem

Compatibility re-export for the built-in filesystem tools.

New first-party code should import from `@guga-agent/core/builtins`.

The implementation registers `fs_read`, `fs_write`, `fs_edit`, `fs_list`, and `fs_search` through the normal plugin context. Paths are contained to a configured workspace root using realpath checks, including symlink escape tests.

The implementation lives in `packages/core/src/builtins/filesystem.ts`. This package remains only to avoid breaking older imports.
