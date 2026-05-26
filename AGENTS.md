<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Research Reference Rule

When a user asks a research question that involves comparing or analyzing reference agent projects, **NEVER start by reading raw source code**. Always follow the 7-layer funnel below, from cheapest (token-wise) to most expensive.

### 7-Layer Research Funnel

```
Layer 1: Context Packs          — topic-summary cards (4K-12K tokens each)
   ↓ miss
Layer 2: Graphify graph.json    — concept graph, query with graphify query "..."
   ↓ miss
Layer 3: Understand-Anything    — code structure graph (nodes + layers + tour)
   ↓ miss
Layer 4: source-analysis/       — design philosophy, architecture articles
   ↓ miss
Layer 5: repomix token trees    — file-level map, find candidate files with rg
   ↓ miss
Layer 6: repomix packed context — source-level confirmation, extract only hit blocks
   ↓ miss
Layer 7: Raw agent-ref repos    — last resort, open only specific files
```

### Layer Details

**L1 — Context Packs** (`docs/research/context-packs/`)

Six pre-built topic packs covering the major subsystems. Always check here first:
- `agent-loop.md` — main loop design, turn lifecycle, streaming, retry
- `tool-registry.md` — tool registration, permissions, MCP, skills
- `context-compression.md` — context budget, compaction, session resume
- `provider-abstraction.md` — LLM provider routing, transport adapters, caching
- `ui-protocol.md` — CLI/TUI/server/ACP/LSP/IM channel patterns
- `multi-agent.md` — subagent spawning, coordination, trace isolation

Each pack contains: key abstractions, cross-project comparison tables, confirmed facts, Guga migration recommendations (Adopt/Adapt/Skip with rationale).

**L2 — Graphify** (`{project}/graphify-out/graph.json`)

Concept-level knowledge graph built by AST extraction. Use for discovering cross-file relationships and key concepts:
```bash
cd /Users/lienli/Documents/GitHub/agent-ref/{project}
graphify query "how does tool execution relate to the agent loop?" --budget 1500
graphify path "ToolRegistry" "ToolExecutor"
graphify explain "RateLimiter"
```

Most established reference projects have complete Graphify graphs. `graphify-out/GRAPH_REPORT.md` highlights god nodes and surprising connections where present. `pi` currently has repomix token tree and focused context, but no checked-in Graphify graph yet.

**L3 — Understand-Anything** (`{project}/.understand-anything/knowledge-graph.json`)

Code structure graph with nodes (file/function/class), edges (imports/calls/contains), architecture layers, and guided tours. Use for:
- Understanding which files belong to which architectural layer
- Finding import/dependency relationships
- Following the architecture tour for a 12-15 step walkthrough

Most established reference projects have complete Understand-Anything graphs. `pi` currently has repomix token tree and focused context, but no checked-in Understand-Anything graph yet.

**L4 — source-analysis/** (`docs/research/source-analysis/`)

Human-written architecture analysis documents. Start from `design-ideas-index.md` to find relevant topic files. These contain design rationale, trade-off analysis, and cross-project comparisons that automated tools cannot produce.

**L5 — Repomix Token Trees** (`docs/research/repomix/*-token-tree.txt`)

Flat file lists with token counts. Use `rg` to search for file names or keywords to locate candidate source files without loading them:
```bash
rg -n "keyword|Symbol|file-name" docs/research/repomix/*-token-tree.txt
```

**L6 — Repomix Packed Context** (`docs/research/repomix/*-context*.xml`)

Full source code packed into XML with `<file path="...">` markers. Only extract the specific file blocks you need, never load the entire file.

**L7 — Raw agent-ref Repos** (`/Users/lienli/Documents/GitHub/agent-ref/{project}`)

Open individual source files only when layers 1-6 are insufficient for line-level verification.

### "参考全项目" Phrase

When the user says **"参考全项目"**, interpret it as **all 9 reference projects**:
`blade-agent-sdk`, `blade-code`, `cc-haha`, `claude-code`, `deepagentsjs`, `deer-flow`, `hermes-agent`, `opencode`, `pi`

This is a research-scope phrase, not a requirement to scan every reference repo during routine coding.

### Output Format

When answering research questions, use this structure:
```markdown
## 一句话结论
## 项目对比
## 可借鉴模式
## 不建议照搬
## Guga 落点
## 证据
```

Mark evidence strength: `Fact` (file-backed), `Inference` (cross-project deduction), `Pending Verification` (needs source confirmation).

### Stopping Criteria

Stop drilling deeper when:
- 2+ reference projects provide clear evidence on the same design point
- Design divergences are explained enough to guide Guga's decision
- Further source reading would only add implementation details, not change architectural judgment
