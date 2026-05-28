# 研究 agent 参考项目架构

## 背景

用户希望系统研究 `/Users/lienli/Documents/GitHub/agent-ref` 下全部 agent 相关项目，并以“从 0 到 1 构建一个 agent”为目标，先对每个项目运行 repomix，再做代码分析。

参考项目：

- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk`
- `/Users/lienli/Documents/GitHub/agent-ref/blade-code`
- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha`
- `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs`
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow`
- `/Users/lienli/Documents/GitHub/agent-ref/opencode`

## 目标

在当前项目 `docs/` 下产出 6 篇中文专题文章，每篇围绕一个 agent 架构主题做跨项目比较、设计解释、可借鉴模式与迁移边界。

专题：

1. ReAct 模式是如何设计的
2. Prompt 工程
3. Context 管理
4. Tool 管理
5. LLM 接入
6. AG-UI / agent UI 协议与前端协同

## 工作要求

- 使用 `arch-insight` 技能路线。
- 输出语言：简体中文。
- 交付模式：Article - Deep Dive；但按用户指定拆成 6 篇专题文章。
- 每个参考项目先运行 repomix，再进行代码分析。
- 重要判断要提供可追溯代码路径。
- 分析要服务“从 0 到 1 构建 agent”的设计学习，而不是泛泛介绍仓库。

## 预期输出

- `docs/research/repomix/`：每个参考项目的 repomix token tree 与打包结果。
- `docs/research/agent-react-pattern.md`
- `docs/research/agent-prompt-engineering.md`
- `docs/research/agent-context-management.md`
- `docs/research/agent-tool-management.md`
- `docs/research/agent-llm-integration.md`
- `docs/research/agent-agui.md`

## 验收标准

- [x] 6 个参考项目都有 repomix 产物或明确记录失败原因。
- [x] 6 篇文章均存在，均为中文。
- [x] 每篇文章都包含跨项目比较、核心设计机制、可借鉴模式、适用边界。
- [x] 每篇文章都包含真实源码路径证据。

## Completion Notes

- 最终研究文章统一迁入 `docs/research/`，避免顶层 `docs/` 混杂执行路线、产品路线和研究材料。
