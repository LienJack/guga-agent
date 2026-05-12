---
name: Guga Agent
last_updated: 2026-05-12
---

# Guga Agent 战略

## 目标问题

团队可以很快做出一个 agent demo，但很难把它变成商业级系统：它需要能跑长任务、能从失败中恢复、能解释自己的行动、能执行权限边界。难点在于，真正的 agent 同时横跨模型接入、工具执行、上下文管理、提示词、客户端协议、审计和产品运营；如果只把它当成聊天包装器，后续每一层都会变脆。

## 我们的方法

Guga Agent 的核心方法是先把 agent 做成 runtime platform：工具、模型调用、上下文、提示词、事件、权限和恢复机制都是有清晰边界的子系统。我们从一个能工作的最小循环开始，在每个边界经过真实压力验证后，再逐步演进到商业级平台。

## 面向谁

**主要用户：** Agent 产品构建者 - 他们使用 Guga Agent，是为了从 0 到 1 搭出生产级 agent 架构，而不是反复踩 runtime、context、tool、protocol 的坑。

**次要用户：** 工程负责人和 AI 平台团队 - 他们使用 Guga Agent，是为了标准化团队内部 agent 的构建、观测、安全和运营方式。

## 关键指标

- **真实任务完成率** - benchmark 工程任务或业务流程任务中，无需人工救援即可完成的比例；通过 eval runs 统计。
- **长任务可恢复率** - context overflow、retry、cancel、restart 后仍能安全继续的比例；通过 runtime 测试和 session log 统计。
- **工具行为审计覆盖率** - 每次工具调用是否都关联了权限决策、输入、输出、artifact、耗时和错误状态；通过 event store 统计。
- **首个生产级 agent 交付时间** - 从项目开始到交付一个具备模型、工具、上下文、UI 和权限基础能力的 agent 所需天数；通过早期用户反馈统计。
- **runtime 边界回归率** - 每个版本中 message pairing、context projection、tool execution、permission、event replay 等边界出现的回归数量；通过 CI 和 bug tracking 统计。

## 工作轨道

### 核心 Runtime

构建 ReAct/tool-calling 主循环、conversation state、loop controller、streaming events、取消、重试和长任务生存能力。

_为什么服务于这个方法：_ runtime 是承重层；所有商业能力都依赖一个能继续、能停止、能恢复、能解释自己的循环。

### 工具与权限系统

把工具变成 runtime 管理的一等对象，具备 schema、effect、permission、execution pipeline、result budget、artifact、lock 和 audit trail。

_为什么服务于这个方法：_ 商业级 agent 必须能行动，但外部行动必须由 runtime 授权和执行，不能让模型自证安全。

### 上下文与提示词平台

拆分 system/history/pending 状态，管理 token budget 和大工具输出，支持 compaction、恢复，以及带来源追踪的提示词装配。

_为什么服务于这个方法：_ 长任务 agent 失败的根源往往是上下文变成一堆不可控消息；平台级 agent 需要 projection、compression、source tracking 和 replay。

### 客户端协议与运营

通过稳定的 Agent UI protocol、session/run API、artifact、usage、compact boundary、provider 配置和运营面板暴露 runtime 事实。

_为什么服务于这个方法：_ 商业级 agent 需要服务 CLI、Web、IDE、API 和企业控制台，但不能为每个客户端复制一套脆弱 loop。

## 里程碑

- **2026-05-12** - 基于参考架构研究，确定初始战略和 roadmap。

## 暂不做

- 在至少两个真实 provider 带来压力之前，不做完整 provider marketplace。
- 在 session recovery、event log 和 context projection 稳定之前，不做长期记忆或向量搜索。
- 在单个 agent 能完成、恢复、审计并解释真实工作之前，不做多 agent 编排。
- 在 runtime 能可靠产出 event、permission、usage 和 artifact 之前，不做企业后台。

## 市场表达

**一句话：** Guga Agent 是一个商业级 agent runtime 蓝图，用来构建能行动、能恢复、可审计的 agent。

**核心信息：** 先做一个能工作的 loop，再逐层长出生产 agent 真正需要的边界：工具、权限、上下文、提示词、事件、恢复和协议。
