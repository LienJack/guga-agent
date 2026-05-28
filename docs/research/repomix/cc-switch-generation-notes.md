# cc-switch Repomix / Graphify Generation Notes

Generated on 2026-05-28 for `/Users/lienli/Documents/GitHub/agent-ref/cc-switch` at commit `3c3d417457a4c3420139488c19718b7415641584`.

## Repomix

- `cc-switch-token-tree.txt`: repository-level token map, excluding lockfiles, image/assets directories, duplicated `cc-switch-main`, and `.git`.
- `cc-switch-context.1.xml`: focused packed context for provider management, MCP, prompts, skills, proxy, sessions, settings, workspace, deeplink, and relevant Tauri services/commands.
- Repomix security scan excluded `src-tauri/src/proxy/http_client.rs` and `src-tauri/src/services/webdav.rs` from `cc-switch-context.1.xml`.

## Graphify

- Graph generated in the reference project at `/Users/lienli/Documents/GitHub/agent-ref/cc-switch/graphify-out/`.
- Scope: 166 focused code files covering core config/provider/MCP/skills/proxy/session paths.
- Mode: AST-only focused graph. Docs, images, screenshots, release notes, and broad UI implementation files were excluded.
- Output summary: 102 nodes, 67 edges, 35 communities.
