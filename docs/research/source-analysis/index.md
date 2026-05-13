# Source Analysis Corpus

This folder stores local source-code analysis materials copied from `/Users/lienli/Documents/GitHub/agent-ref` on 2026-05-13. It is meant for LLM lookup of agent design ideas, not as a complete source mirror.

## Query First

- [Design Ideas Index](./design-ideas-index.md): topic-first routes for design philosophy questions.
- [Claude Code Analysis](./claude-code-analysis/README.md): broad Claude Code reverse-engineering notes.
- [DeerFlow Book](./deerflow-book/contents.md): chapter-based DeerFlow architecture book.
- [Hermes Agent Anatomy](./hermes-agent-anatomy/README.md): Hermes anatomy docs and diagrams.
- [Hermes Wiki](./hermes-wiki/index.md): concept-level Hermes wiki index.
- [Learn OpenCode](./learn-opencode/docs/index.md): learning-oriented OpenCode source analysis and package internals.

## Included Sources

| Corpus | Local source | Copied content | Query strength |
| --- | --- | --- | --- |
| `claude-code-analysis` | `/Users/lienli/Documents/GitHub/agent-ref/claude-code-analysis` | `README.md`, `analysis/**/*.md` | Claude Code architecture, security, privacy, memory, tools, skills, MCP, sandbox, context, prompts, multi-agent, session resume, competitive comparison. |
| `deerflow-book` | `/Users/lienli/Documents/GitHub/agent-ref/deerflow-book` | `index.md`, `contents.md`, `chapters/**/*.md`, public logo assets | DeerFlow architecture, LangGraph engine, lead agent, middleware pipeline, context engineering, subagents, memory, sandbox, tools, MCP, skills, gateway, IM channels, config, deployment. |
| `hermes-agent-anatomy` | `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent-anatomy` | `README*.md`, `_home.md`, `_sidebar.md`, `docs/**/*.md`, diagram images/prompts | Hermes architecture anatomy, diagrams, agent loop, tool registry, provider adapters, context compression, messaging gateway, memory and RL pipeline, comparisons. |
| `hermes-wiki` | `/Users/lienli/Documents/GitHub/agent-ref/Hermes-Wiki` | `README.md`, `SCHEMA.md`, `index.md`, `log.md`, `concepts/**/*.md`, `entities/**/*.md`, `changelog/**/*.md` | Direct concept lookup for Hermes subsystems and design tradeoffs. |
| `learn-opencode` | `/Users/lienli/Documents/GitHub/agent-ref/learn-opencode` | root `*.md`, `docs/**/*.md`, architecture/package diagrams | OpenCode monorepo architecture, agent lifecycle, state sync, permission/tool flow, package internals, ACP/LSP/MCP implementations, SDK, plugin, UI, desktop, web and editor integration. |

## Excluded Noise

The copy intentionally excludes `.git`, dependency folders, zip archives, generated site output, and source-code mirrors. Use the original `agent-ref` repositories or `docs/research/repomix` when source-level verification is needed.

## Suggested LLM Workflow

1. Start with [Design Ideas Index](./design-ideas-index.md).
2. Open the 2-5 linked files for the subsystem being studied.
3. If a claim needs source verification, pivot to `docs/research/repomix` or the original `agent-ref` repository.
   - For Claude Code specifically, use `docs/research/repomix/claude-code-token-tree.txt` and `docs/research/repomix/claude-code-focused-context.xml` to verify against the current `/Users/lienli/Documents/GitHub/agent-ref/claude-code` source. `source-analysis/claude-code-analysis` remains the human-written analysis corpus, not the raw source pack.
4. When comparing against Guga Agent, distinguish copied-source facts from architectural inferences.
