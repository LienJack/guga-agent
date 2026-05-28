# M7/M11 CLI Host Workbench Requirements

## 一句话结论

M7/M11 的第一阶段不是做一个漂亮桌面壳，而是把 Guga 的 `AgentRuntime` 变成可被 CLI、server、Web/desktop viewer 共同消费的 host protocol：CLI 必须先能独立跑完整 agent 工作流，server/SSE 提供同一套 run/session/event/permission/artifact 语义，桌面/Web 先作为轻量工作台投影，不能复制 agent loop。

## 背景

- `任务.md` 要求 M7/M11 先明确 CLI 基础形态，再定桌面/Web 复用的 REST/SSE/permission/artifact/resume/fork 协议。
- `docs/roadmap.md` 将 M7 Host Adapters 与 M11 CLI-first Desktop/Web Workbench 合并推进：CLI 是基础产品，桌面/Web 只是同一 runtime protocol 的投影。
- `docs/research/context-packs/ui-protocol.md` 推荐 Phase 1 采用 OpenCode 式本地 HTTP server + SSE + typed SDK；SSE 优先于 WebSocket。
- `docs/research/agent-agui.md` 建议 Guga 先定义 canonical `AgentUIEvent`，再映射到 Web SSE、CLI stream、IDE ACP、IM wait/stream。
- 当前仓库已有 `packages/core`、session/replay/artifact 插件、tool/permission pipeline、M6 capability discovery，但还没有 `apps/cli`、`apps/server` 或 host protocol 包。

## 用户价值

- 用户可以不依赖桌面/Web，仅用 CLI 发起 run、查看工具进度、处理权限、恢复/分叉 session。
- 后续桌面/Web/IDE 不需要复制 agent loop，只消费同一套 typed protocol。
- 长任务状态、权限请求、工具进度、artifact、context compact、resume/fork 都成为结构化事实，而不是 UI 从 assistant 文本里猜。

## MVP 范围

1. 定义 Host Protocol 的最小资源模型：session、run、event stream、permission request、artifact reference、resume/fork/cancel。
2. 定义 canonical UI projection 事件：run、message、tool、permission、artifact、context、usage/error。
3. 实现最小 server adapter：本地 HTTP API + SSE event stream，包装现有 `AgentRuntime`。
4. 实现 typed SDK client，供 CLI/Web/desktop 复用。
5. 实现 CLI 基础产品面：interactive run、headless run、debug event stream、permission prompt、resume/fork/cancel、artifact/diff/test output。
6. 实现轻量 Web/desktop viewer 的基础协议契约；UI 实现可以先只做 event/artifact/permission viewer。
7. 输出调研报告 `docs/research/cli-desktop-web-host-architecture.md`。
8. 输出计划 `docs/plans/*host*protocol*plan.md`。
9. 输出博客 `blog/build-agent-from-zero-cli-desktop-web-host.md`。

## 非目标

- 不做完整桌面应用复刻。
- 不做 Hermes 式全平台 IM 网关。
- 不做 WebSocket PTY 或多人协作。
- 不做完整 ACP/LSP；只保留 adapter 插槽和研究判断。
- 不让 host protocol 反向污染 `packages/core` 的 agent loop。

## 协议要求

- R1. CLI 和 server 必须复用同一个 `AgentRuntime`、plugin surface、permission pipeline、session/replay/artifact contract。
- R2. UI/protocol event 必须由 core/runtime events 投影而来，不允许 UI 解析 assistant 文本猜状态。
- R3. SSE event 必须带 `runId`、`sessionId`、递增序号或等价顺序字段，方便断线恢复和审计。
- R4. Permission request 必须是服务端持有的 pending control point，approve/deny/cancel 走明确 endpoint。
- R5. Cancel 必须传播到 run control/abort signal，不能只是更新 UI loading 状态。
- R6. Resume/fork 必须基于 M5 session store/replay contracts，而不是临时内存状态。
- R7. Artifact 只暴露 metadata/reference/read endpoint，不在第一版做复杂权限矩阵。
- R8. Typed SDK 必须是 CLI/Web/desktop 共享入口，避免每个客户端手写协议。
- R9. AG-UI、ACP、LangGraph-style stream 只能作为 adapter/compat layer，不成为 Guga canonical schema。

## 验收标准

- [ ] `docs/research/cli-desktop-web-host-architecture.md` 存在并按 7-layer funnel 给出 Fact / Inference / Pending Verification。
- [ ] `docs/plans/*host*protocol*plan.md` 存在并拆分 server、SDK、CLI、viewer/test 单元。
- [ ] 不改 `packages/core` agent loop 即可通过 server/CLI 发起一次 run。
- [ ] CLI headless run 能输出最终答案和失败原因。
- [ ] CLI interactive run 能展示 tool progress 并处理 permission prompt。
- [ ] Server 能创建/读取 session 和 run，并提供 SSE event stream。
- [ ] 同一 session 可以在 CLI 发起，viewer 观察事件或接管 permission response。
- [ ] Resume/fork/cancel 通过协议表达，并有 integration tests。
- [ ] Host protocol 相关 `test/typecheck/build` 通过。
- [ ] `ce-code-review`、`ce-compound`、博客、Trellis finish-work 完成。

## 风险与取舍

- Server-first 可以让多客户端复用更稳，但第一版 CLI 不能因此变得笨重；CLI 应该能自动启动本地 server 或直接走 in-process fallback，计划阶段需要定清楚。
- SSE 足够承载 agent 输出，但权限响应和 cancel 是控制面 endpoint；WebSocket 暂缓。
- 桌面/Web 先做 viewer，不做重工作台，避免 UI 先于真实 code-agent/deep-research 工作流过度设计。
- OpenClaw 是桌面产品主参考，但进入 raw source 前必须先 materialize checkout、跑 repomix/Graphify/Context Pack。

## 证据

- Fact: `docs/research/context-packs/ui-protocol.md` 建议 Phase 1 采纳 HTTP Server + SSE、Session REST API、OpenAPI typed SDK。
- Fact: `docs/research/agent-agui.md` 将 UI/客户端协议拆成 runtime event、canonical `AgentUIEvent`、client adapters 三层。
- Fact: `docs/roadmap.md` M11 要求 CLI-first，桌面/Web 消费同一套 runtime protocol，不复制 agent loop。
- Fact: 当前仓库 `rg --files apps packages` 显示没有 `apps/` 目录，host 产品面尚未落地。
- Inference: M7/M11 应合并规划，因为 M7 的 host adapters 是 M11 CLI-first workbench 的协议底座。
