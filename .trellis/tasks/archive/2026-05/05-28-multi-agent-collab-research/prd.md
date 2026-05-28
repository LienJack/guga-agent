# 调研热门多 Agent 协作项目落地方案

## Goal

调研 2026-05-28 当前热门多 Agent 协作项目，下载代表性项目源码，结合本仓库已有多 Agent 参考研究，分析哪些模式适合落到 Guga 的现有 TypeScript agent runtime。

## What I Already Know

- 用户要求“找热门的，下载下来，再代码研究，分析如何落地”。
- 本仓库已有 `docs/research/context-packs/multi-agent.md`，覆盖 Claude Code、Hermes、DeerFlow、OpenCode、DeepAgentsJS 的多 Agent 设计。
- Guga 当前核心边界在 `packages/core/src/runtime/agent-runtime.ts`、`packages/core/src/loop/agent-loop.ts`、`packages/core/src/tools/*` 和 `packages/core/src/contracts/*`。
- 代表项目已下载到 `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent`。

## Assumptions

- 研究输出语言为简体中文。
- 交付模式为 Deep Dive 迁移评估，重点是 Guga 如何落地，而不是每个仓库的完整导览。
- “热门”以 GitHub stars、近期 push 活跃度、框架差异性综合判断，不只按星数排序。

## Requirements

- 使用当前公开数据筛选热门项目。
- 下载代表项目源码并记录本地路径和 commit。
- 先使用本地 Context Pack / README / 文档，再打开关键源码文件验证。
- 输出 Guga 可执行的分阶段落地方案。

## Acceptance Criteria

- [x] 记录候选项目的 GitHub 热度和活跃度。
- [x] 下载代表项目源码。
- [x] 读取并引用关键源码证据。
- [x] 产出符合项目研究格式的中文报告。

## Out of Scope

- 本任务不直接实现 Guga 多 Agent 功能。
- 不完整扫描每个外部仓库的所有源码。
- 不为外部框架写 benchmark 或运行真实 LLM 调用。

## Technical Notes

- 正式报告：`docs/research/current-multi-agent-collaboration-2026.md`
- 本地源码：`/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent`
- 本地基线：`docs/research/context-packs/multi-agent.md`
