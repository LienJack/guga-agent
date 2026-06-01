# Gemini CLI Reference Context Pack

## 问题边界

本包用于把 Google Gemini CLI 纳入 Guga Agent 的参考项目集合。优先回答这些问题：

- TypeScript 产品态 CLI 如何组织 `core`、`cli`、`sdk`、`a2a-server` 边界。
- Agent turn loop、Gemini chat/client、tool scheduler、tool registry 如何协同。
- MCP、Skills、slash commands、extensions、ACP/A2A、context compression 如何成为可参考的产品能力。
- 哪些 Gemini CLI 模式适合 Guga 迁移，哪些属于成熟产品复杂度，应暂缓照搬。

## 参考项目与版本

| 项目 | 本地路径 | 分支 | Commit |
| --- | --- | --- | --- |
| gemini-cli | `/Users/lienli/Documents/GitHub/agent-ref/gemini-cli` | `main` | `5cac7c10fa9ff34e99553057631727c95c1e99f8` |

## 必读分析材料

- `docs/research/intake/source-contract.md`
- `docs/research/reference-project-workflow.md`
- `docs/research/repomix/gemini-cli-generation-notes.md`
- `docs/research/graphs/gemini-cli/GRAPH_REPORT.md`

## 必读源码文件

先用 `docs/research/repomix/gemini-cli-token-tree.txt` 路由，再从 `docs/research/repomix/gemini-cli-focused-context.xml` 抽取这些文件块：

- Agent loop / model client: `packages/core/src/core/turn.ts`, `packages/core/src/core/client.ts`, `packages/core/src/core/geminiChat.ts`, `packages/core/src/core/baseLlmClient.ts`, `packages/core/src/core/contentGenerator.ts`, `packages/core/src/core/prompts.ts`
- Tool execution: `packages/core/src/scheduler/scheduler.ts`, `packages/core/src/scheduler/tool-executor.ts`, `packages/core/src/scheduler/policy.ts`, `packages/core/src/tools/tool-registry.ts`, `packages/core/src/tools/tools.ts`, `packages/core/src/tools/mcp-client.ts`, `packages/core/src/tools/mcp-tool.ts`
- Context and memory: `packages/core/src/context/contextManager.ts`, `packages/core/src/context/contextCompressionService.ts`, `packages/core/src/context/chatCompressionService.ts`, `packages/core/src/context/memoryContextManager.ts`, `packages/core/src/context/pipeline.ts`, `packages/core/src/context/truncation.ts`, `packages/core/src/config/memory.ts`
- Skills / extensions / commands: `packages/core/src/tools/activate-skill.ts`, `packages/cli/src/services/SkillCommandLoader.ts`, `packages/cli/src/services/McpPromptLoader.ts`, `packages/cli/src/services/CommandService.ts`, `packages/cli/src/config/extension-manager.ts`
- CLI / protocols: `packages/cli/src/gemini.tsx`, `packages/cli/src/nonInteractiveCliAgentSession.ts`, `packages/cli/src/acp/acpSession.ts`, `packages/cli/src/acp/acpSessionManager.ts`, `packages/sdk/src/agent.ts`, `packages/sdk/src/session.ts`, `packages/sdk/src/tool.ts`, `packages/a2a-server/src/agent/task.ts`

## 关键抽象

- `Turn` / `GeminiChat` / `GeminiClient`: 将模型流式响应、function call、重试和 turn 生命周期放在 core 层。
- `Scheduler` / `ToolExecutor` / `ToolRegistry`: 将工具声明、权限策略、执行状态和结果回流拆成可测试模块。
- `ContextManager` / compression services / context pipeline: 将上下文预算、历史裁剪、工具输出蒸馏和 memory 注入从主 loop 中拆出。
- CLI services: `CommandService`、`SkillCommandLoader`、`McpPromptLoader` 把 slash commands、skills 和 MCP prompts 做成 UI/CLI 可发现能力。
- ACP / A2A / SDK: Gemini CLI 同时暴露本地交互、协议会话和 SDK 包，适合作为“产品态 agent core 外围接口”的参考。

## 已确认事实

- Fact: Repomix token tree 覆盖 Gemini CLI 全仓，focused context 覆盖 586 个核心文件，包含 core/cli/sdk/a2a-server 主链路。
- Fact: Graphify 全仓 AST 图已生成，报告显示 2,140 个代码文件、8,734 个节点、23,689 条关系、149 个社区。
- Fact: `gemini-cli-focused-context.xml` 中包含 `turn.ts`、`client.ts`、`geminiChat.ts`、`scheduler.ts`、`tool-executor.ts`、`tool-registry.ts`、`contextManager.ts`、`acpSession.ts`、`packages/sdk/src/agent.ts` 等关键文件块。
- Inference: Gemini CLI 更适合作为“成熟 TypeScript CLI 产品态 agent”的参考，而不是 Guga 初期最小 core 的目录模板。

## Guga 迁移判断

- Adopt: core/cli/sdk/protocol 分层思路；tool registry 与 scheduler 拆分；上下文管理从 agent loop 中独立；CLI commands/skills/MCP prompt 的加载器边界。
- Adapt: ACP/A2A/SDK 可以作为未来外部协议边界参考，但 Guga 初期应先稳定内部 session/event/tool result 契约。
- Skip for now: 全量产品 UI、复杂 telemetry、企业配置 schema、浏览器/voice/IDE 大面能力，以及大型 extension registry。

## 待验证问题

- Gemini CLI 的 `Turn` 与 scheduler 之间的错误恢复、权限提示和并发工具执行细节，需要在具体架构设计问题中抽取源码块确认。
- Graphify 全仓图包含 tests/evals/UI 长尾，god nodes 会偏向通用函数和配置对象；做设计判断时应以 token tree + focused context 复核。
- 还没有为 Gemini CLI 生成 Understand-Anything 图；需要结构化 walkthrough 时再补。
