# brainstorm: design long-running agent roadmap

## Goal

把用户提出的 Guga Agent 超长建设路线整理成可 review、可执行、可持续迭代的清单。核心目标不是一次性实现所有能力，而是把长期工作拆成按模块推进的工程轨道：小内核、插件化能力、专业 agent、deep research、CLI-first 终端、桌面/Web 工作台，以及每个大模块之后的调研报告和“从 0 写 agent”博客沉淀。

## What I already know

- Guga 的产品哲学是 pi agent / Blade Agent SDK 式：底层是一个尽量小的 core，能力通过插件、provider、tools、skills、MCP、context policy、session store 等加载进来。
- 用户希望在 core 稳定后继续建设专业 agent，尤其是 code-agent；代码能力的主要目标对齐 Claude Code 和 OpenCode。
- 用户还希望建设 deep research agent，并重点参考 DeerFlow。
- CLI 是最基础形态，必须先能独立完成基础 agent 工作流。
- 桌面应用目标对齐 OpenClaw 和 Hermes；OpenClaw 需要后续确认版本/源码锚点。
- 最终终端形态包括 CLI、桌面应用、Web；展示终端前必须先调研通信协议。
- 每个大模块都要先深度调研其他项目，并在 `docs/` 下产出调研报告。
- 每完成一个大模块，都要用 `write-blog` 工作流在 `blog/` 下写“如果从 0 开始建立 agent”的系列文章。
- 用户要求严格执行：`ce-brainstorm` -> `trellis-brainstorm` -> `ce-plan` -> `ce-work` -> `ce-code-review` -> `ce-compound` -> `trellis-finish-work`。
- `任务.md` 应写成可执行清单，而不是愿景说明。
- `docs/roadmap.md` 已经包含 M0-M8 的 core/plugin 路线，M0-M5 当前已有对应实现/计划痕迹，后续需要把专业 agent、deep research、终端协议和博客/调研节奏显式接入 roadmap。

## Assumptions

- 这次只做文档设计与路线对齐，不进入功能实现。
- `任务.md` 是给用户 review 的主交付物；`docs/roadmap.md` 是长期路线的背景文档。
- 当前不需要对每个参考项目打开原始源码；已有 context packs、source-analysis 和 roadmap 足够支撑可执行清单的第一版。

## Open Questions

- 用户 review 后再决定是否把 `任务.md` 拆成多个 `docs/brainstorms/` 和 `docs/plans/` 文档。

## Requirements

- R1. `任务.md` 必须是可勾选的执行清单，按模块列出研究、需求、计划、实现、review、知识沉淀、博客、finish gate。
- R2. 清单必须保留用户指定的工作流顺序，并把它作为每个大模块的默认 gate。
- R3. 清单必须明确每个大模块要参考哪些项目、产出哪些调研文档、实现哪些能力。
- R4. 清单必须把 core + plugin 哲学写成路线约束，避免专业 agent 能力反向污染 core。
- R5. 清单必须包含 code-agent、deep research agent、CLI-first host、桌面/Web 工作台协议调研与目标对齐。
- R6. 清单必须包含每个大模块完成后的 `write-blog` 产出。
- R7. `docs/roadmap.md` 必须同步补充长期阶段，避免 roadmap 只停在通用 runtime / operations。

## Acceptance Criteria

- [x] `任务.md` 包含模块化可执行清单，用户可以逐项 review、勾选、拆任务。
- [x] `docs/roadmap.md` 明确后续专业 agent、deep research、host protocol、learning/blog flywheel 的阶段位置。
- [x] 文档引用使用 repo-relative 路径。
- [x] 不读取原始参考仓库源码，除非已有研究资料不足。
- [x] 不启动实现、不改业务代码。

## Definition of Done

- 文档已写入。
- Markdown 结构可读，可被后续 `ce-plan` / `trellis-brainstorm` 继续使用。
- `git diff` 可清楚展示本次只做路线和任务文档。
- Solution 与 blog 文章已补齐，满足长任务执行纪律。

## Out of Scope

- 不实现任何新 package、CLI、Web、agent 能力。
- 不创建完整 `docs/plans/` 实施计划。
- 不补写 M5 博客正文，只把它作为 backlog 项写入执行清单。

## Technical Notes

- 研究遵循 `AGENTS.md` 的 7-layer funnel，优先读 `docs/research/context-packs/`、`docs/research/source-analysis/design-ideas-index.md`、`docs/agent-*.md` 和 `docs/roadmap.md`。
- 已检查：
  - `docs/research/context-packs/agent-loop.md`
  - `docs/research/context-packs/tool-registry.md`
  - `docs/research/context-packs/provider-abstraction.md`
  - `docs/research/context-packs/context-compression.md`
  - `docs/research/context-packs/ui-protocol.md`
  - `docs/research/context-packs/multi-agent.md`
  - `docs/research/source-analysis/design-ideas-index.md`
  - `docs/roadmap.md`
  - `packages/core/README.md`
