---
name: Guga Agent
last_updated: 2026-05-28
---

# Guga Agent 战略

## 目标问题

用户需要一个既能写代码、做深度搜索、又能操作本地电脑的 agent，但现有产品往往在某一类能力上很强，在整体架构上却容易变成臃肿黑箱：核心循环、工具、权限、上下文、客户端和插件边界互相缠绕，越加能力越难维护、扩展和信任。

## 我们的方法

Guga Agent 的设计哲学参考 pi agent：核心保持极简，只保留 agent loop、上下文投影、工具注册、权限审计、事件流和插件协议这些承重边界；其他能力全部通过插件、profile 或 toolset 挂载。

核心不追求把所有能力内建，而是提供稳定的执行底座，让 coding、deep search、computer use、MCP、客户端适配和未来能力都能以可安装、可禁用、可审计的方式扩展。

## 面向谁

**主要用户：** 高强度使用 AI 的开发者和个人生产力用户 - 他们使用 Guga Agent，是为了在同一个 agent 中完成代码修改、项目理解、资料研究、网页操作和本地电脑任务，而不用在多个互不共享上下文的工具之间切换。

**次要用户：** Agent 插件和工具构建者 - 他们使用 Guga Agent，是为了把自己的工具、模型、工作流、MCP 服务或客户端入口接入一个简单、稳定、可审计的 agent 核心。

## 关键指标

- **真实任务完成率** - coding、deep search、computer use 三类任务中，无需人工救援即可完成的比例；通过 eval runs 和用户 session log 统计。
- **插件化能力覆盖率** - 新能力是否能以插件/profile/toolset 接入，而不修改核心 loop；通过核心代码改动比例和插件 API 使用情况统计。
- **长任务可恢复率** - context overflow、retry、cancel、restart 后仍能安全继续的比例；通过 runtime 测试和 session log 统计。
- **权限与审计覆盖率** - 文件、命令、网络、浏览器、桌面操作是否都关联权限决策、输入、输出、artifact、耗时和错误状态；通过 event store 统计。
- **跨端一致性** - CLI、Web 端、桌面端对同一 session 的事件、工具结果、artifact 和权限状态是否一致；通过协议测试和端到端测试统计。

## 工作轨道

### 极简 Agent Core

构建一个足够小但稳定的核心：ReAct/tool-calling 主循环、conversation state、context projection、streaming events、取消、重试、恢复和 audit trail。

_为什么服务于这个方法：_ 核心越简单，插件边界越清楚；Guga 的竞争力不是把所有能力塞进 core，而是让 core 长期可理解、可测试、可替换。

### 插件与工具运行时

把工具、MCP、profile、skill、renderer 和客户端扩展都纳入统一插件模型，内建能力只作为默认插件存在。

_为什么服务于这个方法：_ coding、deep search、computer use 和未来能力都应该通过同一套注册、权限、执行、结果归一化和卸载机制进入系统。

### Coding Agent 能力

吸收 Claude Code、pi agent code、Blade Code 的 coding 能力：项目理解、文件编辑、shell/git 工作流、代码搜索、测试修复、长任务上下文和可解释的工具执行。

_为什么服务于这个方法：_ coding 是 Guga 的第一高频任务，也是检验核心 loop、工具权限、上下文管理和恢复能力是否可靠的压力测试。

### Deep Search 与电脑操作

参考 DeerFlow 做 deep search：任务分解、证据账本、来源分层、报告生成和可复用研究 artifact；参考 OpenClaw、Hermes 做 computer use：浏览器、本地应用、桌面自动化、网关/会话隔离和操作审计。

_为什么服务于这个方法：_ Guga 不只是代码助手，还要能在开放网络和本地电脑环境里完成真实任务；这些高风险能力必须作为可控插件运行，而不是绕过 core 直接行动。

## 里程碑

- **2026-05-12** - 基于参考架构研究，确定初始战略和 roadmap。
- **2026-05-28** - 将战略调整为 pi agent 式极简核心 + 插件化能力体系，并明确 coding、deep search、computer use 与 CLI/Web/Desktop 消费端方向。

## 暂不做

- 不把所有能力内建进 core；默认能力也必须能退回插件/profile/toolset 边界。
- 在插件权限、事件审计和结果归一化稳定之前，不开放无约束第三方插件生态。
- 在单 agent 的 coding、deep search、computer use 能力可靠之前，不优先做复杂多 agent 编排。
- 在 CLI、Web 端、桌面端共享同一 session/event 协议之前，不为每个客户端复制独立 runtime。

## 市场表达

**一句话：** Guga Agent 是一个极简核心、插件扩展的个人 AI agent，用一个上下文完成代码、搜索和电脑操作。

**核心信息：** 像 pi agent 一样保持核心简单；像 Claude Code、pi agent code、Blade Code 一样能写代码；像 DeerFlow 一样能深度搜索；像 OpenClaw、Hermes 一样能连接和操作用户的电脑，并通过 CLI、Web 端、桌面端提供一致体验。
