---
date: 2026-05-26
topic: m0-core-kernel-spike
---

# M0 Core Kernel Spike

## Summary

本任务定义 Guga Agent 的第一段可执行切片：一个最小 core runtime，能够在不依赖产品 UI、真实 provider SDK、plugin loader 或持久化的前提下，完成一次 `user -> model -> tool -> model -> final` 闭环。

---

## Problem Frame

Guga Agent 的方向是小内核加插件生态。在加入 plugin host、hooks、真实 providers、工具权限、上下文策略或 session replay 之前，项目需要先证明 core runtime 边界本身能够承载最基础的 agent loop。

当前最大的风险是让后续平台能力过早漏进第一版实现。如果 M0 包含太多内容，core 一开始就会职责不清；如果 M0 包含太少内容，后续阶段又缺少可信基线，无法稳定验证 message pairing、provider 抽象、tool result 处理、失败回流和事件可观察性。

---

## Actors

- A1. Host application：创建 runtime、注入能力、启动 run，并观察事件。
- A2. Core runtime：负责生命周期、loop 推进、conversation state、tool call/result 配对和事件发布。
- A3. Mock provider：模拟模型行为，包括 tool-calling 和 final response，不引入真实 provider SDK。
- A4. Test tool：模拟一个可执行能力，能够返回成功结果或结构化失败。
- A5. Implementer：根据 PRD 和已配置上下文实现 M0，避免把后续阶段范围提前带入。

---

## Key Flows

- F1. 成功的 tool-calling run
  - **Trigger:** Host 使用已注册的 mock provider 和 test tool，以一条 user message 启动 agent run。
  - **Actors:** A1, A2, A3, A4
  - **Steps:** Runtime 向 provider 请求下一步模型输出，收到 tool call，执行匹配的已注册 tool，记录 tool result，再把配对后的结果交回 provider，并收到 final assistant answer。
  - **Outcome:** Run 以 final answer 完成；tool call/result 配对完整；usage 信息在 provider 提供时可见；关键 turn 边界都有可观察事件。
  - **Covered by:** R1, R2, R3, R4, R5, R7

- F2. Tool 失败仍然对模型可见
  - **Trigger:** 已注册 tool 在 run 中执行失败。
  - **Actors:** A2, A3, A4
  - **Steps:** Runtime 将失败归一化为结构化 tool observation，保持 tool call/result 配对，发布相关事件，并把 observation 回流给 provider 作为下一步模型输入。
  - **Outcome:** 默认情况下，tool 失败不会直接让 loop 崩溃，也不会只消失在日志里；模型能够基于结构化失败继续响应。
  - **Covered by:** R3, R4, R6, R7

---

## Requirements

**Core runtime boundary**
- R1. Core runtime 必须提供面向宿主应用的公开接口，用于创建 agent runtime、注册必要能力、运行一次 user turn、干净停止或结束，并释放 runtime 资源。
- R2. Core runtime 不得依赖 CLI、Web、IDE、server API、worker process 等具体产品 host。
- R3. Core contracts 必须让 provider、message、tool call、tool result、usage、event 等概念独立于任何真实 provider SDK 类型。

**Agent loop behavior**
- R4. Agent loop 必须支持最小 tool-calling 生命周期：接收 user input，向 provider 请求 response，执行模型请求的已注册 tool，把 tool result 回流给 provider，并在 provider 给出 final answer 时停止。
- R5. Conversation state 必须保持有效的 model/tool 配对关系，确保 tool result 能关联到发起它的 model tool call。
- R6. Tool failure 必须被表示为可回流给 provider 的结构化 observation，而不是只作为 host 可见的非结构化 exception。
- R7. Loop 必须为关键生命周期节点发布可观察事件，包括 run start/end、model request/response、tool call/result、errors，以及 provider 可提供的 usage。

**Capability registration**
- R8. M0 必须包含内存版 capability registry，至少支持为一次 run 注册并解析一个 provider 和一个 tool。
- R9. Provider 或 tool 缺失时，capability registration 必须显式失败并可观察，不能静默回退到隐式默认值。
- R10. M0 必须包含一个 mock provider 和一个 test tool，用于在没有外部服务的情况下验证完整闭环。

**Validation**
- R11. 自动化测试必须覆盖：成功 tool-calling run、tool failure run、缺失 capability 行为，以及 core contracts 不泄漏具体 provider SDK 类型。
- R12. 实现必须把后续阶段能力排除在 M0 外，除非它是满足最小 loop 和测试所必需的内容。

---

## Acceptance Examples

- AE1. **Covers R4, R5, R7, R10.** Given 一个已注册 mock provider 会先请求 tool、再返回 final answer，当 host 用一条 user message 运行 agent 时，run 会完成并得到 final answer，同时留下配对的 tool call/result 和 model/tool 活动事件。
- AE2. **Covers R3, R10, R11.** Given 没有安装或配置任何真实 provider SDK，当 M0 测试运行时，测试仍能通过 mock provider 验证 loop，并且不需要 provider-specific 类型。
- AE3. **Covers R6, R7, R11.** Given 已注册 test tool 执行失败，当 runtime 执行该 tool call 时，失败会作为结构化 tool observation 回流，相关 error/result event 会被发布，provider 能基于该 observation 产出 final response。
- AE4. **Covers R8, R9, R11.** Given provider 或请求的 tool 未注册，当 host 启动或继续一个依赖该能力的 run 时，runtime 会暴露显式失败，并发布可观察 error event。

---

## Success Criteria

- 下游 implementer 不需要再发明 plugin、hook、真实 provider、持久化或 UI 是否属于第一阶段。
- Core tests 只依赖内存/模拟能力，就能证明最小 agent loop 和 tool failure 行为。
- 产出的 core 边界足够小，后续 M1-M3 能在其上添加 plugin host、hooks、providers、tools 和 permissions，而不需要重写 M0 loop contract。
- 每次 M0 run 都会产生足够事件，让 host 或测试无需解析 assistant 文本也能理解发生了什么。

---

## Scope Boundaries

- 不做真实 provider integration。
- 不做 filesystem、shell、browser、git、MCP 或其他真实工具。
- 不做 plugin manifest、plugin loader、HookKernel、namespace 处理、reload 或 stale context guard。
- 不做持久化 session store、replay、fork、artifact store 或持久化 event log。
- 不做 CLI、Web、IDE、server API 或 UI projection。
- 不做 context compaction、skills、long-term memory、multi-agent orchestration 或 eval infrastructure。

---

## Key Decisions

- M0 先证明 core loop，再进入 plugin infrastructure：第一阶段应聚焦生命周期、状态、契约和可观察性。
- 先使用 mock provider：真实外部 provider 行为对 runtime contract 验证来说噪声太大，应留到后续 provider-plugin 阶段。
- Tool failure 是 happy-path contract 的一部分：商业级 agent 必须让失败动作对模型和 host 可见，而不是把它们当成偶发 exception。
- M0 必须有事件：audit、replay、UI、eval 虽然是后续阶段，但它们都依赖 core 从一开始就产出事件事实。

---

## Dependencies / Assumptions

- `docs/roadmap.md` 是 M0/M1 边界的主要事实来源。
- `STRATEGY.md` 锚定更大的产品目标：构建能行动、能恢复、可审计的 runtime platform。
- 当前项目 spec 还比较稀疏，因此 implementation planning 需要先确认语言、包管理器和测试框架。
- 使用参考项目研究时，应优先读取已准备好的 context packs，再考虑打开原始参考仓库。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1-R12][Technical] 在当前仓库主要还是文档的前提下，第一版 core package 应采用什么语言和 package layout？
- [Affects R11][Technical] M0 应引入哪套 test runner 和 package tooling？
- [Affects R7][Technical] 什么样的 event shape 对 M0 足够，同时又不阻碍后续 replay/audit？
