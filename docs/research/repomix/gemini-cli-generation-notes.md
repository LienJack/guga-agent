# gemini-cli Repomix / Graphify Generation Notes

Generated on 2026-05-28 for `/Users/lienli/Documents/GitHub/agent-ref/gemini-cli` at commit `5cac7c10fa9ff34e99553057631727c95c1e99f8`.

## Repomix

- `gemini-cli-token-tree.txt`: repository-level token map for all files accepted by Repomix default filters.
- `gemini-cli-focused-context.xml`: focused packed context for CLI/core/SDK/A2A agent main paths, including agent turn loop, Gemini chat/client, scheduler, tools, MCP, skills, context management, config, prompts, ACP, commands, extensions, and reference docs.
- Focused context excludes `*.test.ts`, `*.test.tsx`, snapshots, `docs/assets`, `packages/core/vendor`, and `package-lock.json` to keep the reference pack usable.
- Focused context summary: 586 files, 1,237,190 tokens, 5,216,765 chars.

## Graphify

- Graph generated in the reference project at `/Users/lienli/Documents/GitHub/agent-ref/gemini-cli/graphify-out/`.
- Archived copy lives in `docs/research/graphs/gemini-cli/`.
- Scope: full AST extraction over 2,140 code files.
- Output summary: 8,734 nodes, 23,689 edges, 149 communities.
- HTML visualization was not generated because the full graph exceeds Graphify's HTML size guard. Use `graphify query ... --graph docs/research/graphs/gemini-cli/graph.json` for navigation.
- The full graph includes tests/evals/UI files, so use Graphify for discovery and confirm design claims with `gemini-cli-token-tree.txt` plus focused context file blocks.
