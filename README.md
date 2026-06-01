<p align="center">
  <img src="assets/guga-mascot-pixel.png" alt="Guga Agent 像素风吉祥物" width="180">
</p>

<h1 align="center">Guga Agent</h1>

<p align="center">
  小内核、强插件、可恢复、可审计、可嵌入的 Agent Runtime。
</p>

<p align="center">
  <a href="README.md">简体中文</a> |
  <a href="README.en.md">English</a> |
  <a href="README.ja.md">日本語</a>
</p>

---

## Guga Agent 是什么

Guga Agent 是一个面向 agent 产品构建者的 TypeScript runtime monorepo。它不是先做一个大而全的聊天应用，再把能力从应用里拆出来；它先把 agent 真正承重的部分做成可组合的运行时内核：模型调用、工具执行、权限、上下文、事件、插件、会话存储、artifact 和 replay 都有清晰边界。

一句话说，Guga Agent 想解决的是：如何从一个能跑的 agent demo，走向一个能交付、能恢复、能审计、能嵌入真实产品的 agent 系统。

## 解决什么问题

很多 agent 原型看起来只是“模型加工具”，但一进入真实业务就会遇到同一组问题：

- 长任务跑到一半上下文溢出，压缩后不知道还能不能继续。
- 工具能读写文件、执行命令，但权限、审计和结果回流散落在各处。
- Provider SDK 类型穿透主循环，换模型、重试、fallback 会牵动全局。
- UI、CLI、IDE、API 都想看同一场 run，却各自解析字符串和临时状态。
- session 只能靠内存续命，崩溃、取消、重启、分支和回放都很脆。
- 插件和工具越加越多，但顺序、命名空间、权限和 stale context 没有统一规则。

Guga 的答案是把这些问题收回 runtime：模型只提出意图，runtime 负责执行边界；上下文是投影，不是唯一事实源；事件是账本，UI 和审计都从账本派生。

## 设计哲学

### 小内核，大外围

`@guga-agent/core` 只拥有 agent 生命周期、状态机、事件、hook、能力注册、权限协议、工具执行管线和核心契约。真实 provider、文件系统、shell、git、session store、artifact store、context policy 等都作为插件接入。

### 插件是一等公民

first-party 能力和 host 自定义能力走同一套插件上下文：注册 provider、tool、hook、store 或 context policy。插件不能直接修改核心状态，只能通过明确的能力注册和 typed hook result 参与运行。

### 事件是事实源

一次 run 中的模型请求、工具调用、权限决策、hook 决策、usage、artifact、错误、压缩边界和 replay 线索都应该成为可记录事实。最终回答只是结果，事件账本才是可恢复和可审计的基础。

### 权限由 runtime 执行

模型可以解释为什么要执行某个动作，但不能自我授权。所有工具意图都进入 `ExecutionPipeline`，经过 schema、hook、permission、scheduler、timeout、result policy 和事件记录。

### 上下文是投影

模型输入不是把历史无限拼接起来，而是由 conversation state、context source、artifact reference、compaction boundary 和 policy 共同投影出来。summary 是续航手段，不是唯一事实源。

### 渐进式商业化

Guga 不急着第一天做完整 marketplace、长期记忆、多 agent swarm 或企业后台。先稳定 loop、tool、provider、context、session 和 replay 这些基础边界，再让产品能力在插件生态里生长。

## 当前功能

| 能力 | 包 | 说明 |
| --- | --- | --- |
| Core Runtime | `@guga-agent/core` | Provider-neutral message、`AgentLoop`、`ConversationState`、`CapabilityRegistry`、`EventBus`、`ProviderRouter`、hook contracts、permission、tool execution pipeline、result policy。 |
| AI SDK Provider Bridge | `@guga-agent/provider-ai-sdk` | 将 Vercel AI SDK provider 映射到 Guga provider runtime contract，支持 `gateway`、`openai-compatible`、`openai`、`anthropic` 模式。 |
| Filesystem Tools | `@guga-agent/plugin-tools-filesystem` | 注册 `fs_read`、`fs_write`、`fs_edit`、`fs_list`、`fs_search`，并用 realpath containment 防止越界。 |
| Shell Tool | `@guga-agent/plugin-tools-shell` | 注册 `shell_exec`，默认 ask-by-default、串行执行、限制环境变量，host 可替换 sandbox backend。 |
| Git Tools | `@guga-agent/plugin-tools-git` | 提供 `git_status`、`git_diff`、`git_commit_message` 等安全辅助工具，不暴露 push、reset、rebase 等高风险操作。 |
| JSONL Session Store | `@guga-agent/plugin-session-jsonl` | 本地优先的 append-only event/session store，支持 revision、idempotency、hash-chain continuity 和 corruption diagnostics。 |
| Artifact Store | `@guga-agent/plugin-artifact-filesystem` | 将大工具输出和 replay artifact 存到文件系统，事件里只保留 bounded preview 和可验证引用。 |
| Replay Audit | `@guga-agent/plugin-replay-audit` | 从 durable facts 派生 conversation、model-input 和 audit timeline，不重跑 provider、tool 或 mutating hook。 |
| Default Context Policy | `@guga-agent/plugin-context-default` | 注册默认 context policy 和 resources、assemble、budget、truncate、compact、reinject 等阶段 hook。 |

## 使用方式

当前仓库更接近 runtime/workbench 基座，而不是已经发布的终端应用。开发和验证可以从 monorepo 命令开始：

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

最小 host 形态通常是创建 runtime，挂载 provider 与插件，然后运行一轮：

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createAiSdkProviderPlugin } from "@guga-agent/provider-ai-sdk";
import { createFilesystemPlugin } from "@guga-agent/plugin-tools-filesystem";
import { createJsonlSessionPlugin } from "@guga-agent/plugin-session-jsonl";

const runtime = createAgentRuntime({
  plugins: [
    createAiSdkProviderPlugin({
      id: "local-provider",
      mode: "openai-compatible",
      modelId: "local-model",
      baseURL: "http://localhost:11434/v1",
      apiKey: "test",
      metadata: {
        purposes: ["primary"],
        capabilities: { toolCalling: true, usage: "optional" }
      }
    }),
    createFilesystemPlugin({ workspaceRoot: process.cwd() }),
    createJsonlSessionPlugin({ rootDir: ".guga/sessions" })
  ]
});
```

## 和 OpenCode、Pi Agent 的关系

Guga 会借鉴成熟开源 agent 项目的经验，但产品重心不同：

- OpenCode 更像一个完整的开源 coding agent 产品，强调 TUI、客户端/服务器架构、多 provider 和用户可直接使用的开发体验。
- Pi Agent 更像一个 self-extensible agent harness，强调 monorepo、runtime、extension、session 和数据飞轮。
- Guga 的目标是为 agent 产品构建者提供 runtime 基座。它优先沉淀可嵌入的核心边界，让 CLI、Web、IDE、worker、企业控制台都能复用同一个运行时事实源。

## 路线图方向

- 稳定 core runtime、provider bridge、tool pipeline、permission kernel 和 event facts。
- 强化 context projection、tool result budget、compaction boundary 和 session resume。
- 完善 local plugin host，逐步扩展到 manifest、namespace、reload、stale context guard。
- 增加 skills、MCP、eval、multi-agent delegation、UI projection 和运营层能力。
- 在真实 provider 和真实任务压力下，再推进模型运营、成本、credential pool、远端 sandbox 和企业策略。

## 当前状态

Guga Agent 仍处在早期 runtime 架构落地阶段。它已经有 core contracts、first-party provider bridge、工具插件、JSONL session、artifact 和 replay audit 的基础包，但还不是一个开箱即用的完整 coding agent 应用。

如果你想基于它构建产品，请把它当成 agent runtime 工程基座，而不是简单的聊天 UI 套壳。

## License

本项目使用 Apache License 2.0，详见 [LICENSE](LICENSE)。
