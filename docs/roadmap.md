# Guga Agent 详细 Roadmap

这份 roadmap 把 `docs/` 中的参考架构研究转化为可执行的工程路线。它不是功能愿望清单，而是从 0 到 1 构建商业级 agent 的分层交付计划：每个阶段只解决一类会让下一阶段崩掉的基础问题，完成后必须能被测试、审计和继续演进。

## 产品最终形态

Guga Agent 的最终形态是一个商业级 agent runtime platform，而不是聊天包装器。它应该同时具备以下能力：

- **Agent Core Runtime**：ReAct/tool-calling 主循环、streaming、取消、重试、max-turn 控制、重复调用防护、长任务恢复和工具状态流转。
- **LLM Provider Platform**：统一模型客户端、模型能力注册表、provider adapter、错误归一化、fallback、用户自带 key、模型发现、token 和成本统计。
- **Tool Runtime**：工具注册表、执行管道、权限系统、路径安全、超时、锁、结果预算、artifact、MCP/plugin 工具和审计记录。
- **Context Platform**：`system / history / pending` 状态、token budget、工具输出治理、大结果存储、compaction、session recovery 和 context projection audit。
- **Prompt Platform**：分层 PromptBuilder、项目规则、用户记忆、skills 与 middleware 同步、来源追踪、prompt budget、prompt versioning 和 prompt diff。
- **Agent UI Protocol**：稳定事件协议，覆盖 message、tool、permission、artifact、usage、compact boundary、cancel、wait、resume 和多客户端投影。
- **Commercial Operations**：session、run、replay、artifact、provider 配置、权限策略、日志、eval、多租户控制和企业审计。

## 建议代码布局

当前更推荐 **core-first**：先做一个可被其他项目引用的核心 runtime 包，CLI、Web、Server、IDE adapter 都只是外层消费者。这个方向更接近 `blade-agent-sdk` 和 `deepagentsjs` 的价值：核心能力先作为库稳定下来，而不是被某个应用入口绑死。

参考项目给出的布局信号：

- **`blade-agent-sdk`** 把核心能力放在 `src/agent/`、`src/agent/loop/`、`src/agent/state/`、`src/context/`、`src/tools/`、`src/tools/execution/`、`src/session/`、`src/prompts/`。它适合作为 Guga core 的主要参考。
- **`deepagentsjs`** 把 framework 能力放在 `libs/deepagents/src/`，并用 `middleware/`、`backends/`、`stream`、`evals/`、`examples/` 分离扩展能力。它说明 filesystem、summarization、subagents、skills 这类能力应可组合，不应都写死进主循环。
- **`blade-code`** 把产品入口放在 `packages/cli/src/`、`packages/cli/web/src/`、`packages/cli/src/acp/`。它适合参考 adapter 层，但不应让 Guga 的 core 依赖 CLI/Web。
- **`opencode`** 是成熟 monorepo：`packages/opencode`、`packages/app`、`packages/console`、`packages/sdk`、`packages/web` 分离。Guga 可以后期演进到这个形态，但早期不需要一次性复制。
- **`hermes-agent`** 将 `agent/`、`tools/`、`providers/`、`gateway/`、`acp_adapter/`、`environments/` 分开。它说明多客户端 gateway、ACP、provider profile、eval environments 都应该在 core 外围。

### 推荐起步：一个核心包，多个薄 adapter

第一阶段建议建立 `packages/core`，并保证它可以被其他项目直接依赖。`apps/cli` 只是验证 core 的最小入口，不承担业务逻辑。

```text
packages/
  core/
    src/
      index.ts
      agent/
        agent-loop.ts
        loop-controller.ts
        streaming-tool-executor.ts
        types.ts
      state/
        conversation-state.ts
        turn-state.ts
      events/
        agent-event.ts
        event-emitter.ts
      llm/
        llm-client.ts
        model-capabilities.ts
        provider-errors.ts
      tools/
        tool-definition.ts
        tool-registry.ts
        tool-executor.ts
        tool-result.ts
        execution/
          execution-pipeline.ts
          scheduler.ts
          file-lock-manager.ts
        permissions/
          permission-manager.ts
          path-safety.ts
        builtins/
          read-file.ts
      context/
        context-budgeter.ts
        output-truncator.ts
        tool-result-store.ts
        compaction-service.ts
        context-assembler.ts
      prompts/
        prompt-builder.ts
        prompt-sources.ts
      sessions/
        event-store.ts
        session-store.ts
        projections.ts
      artifacts/
        artifact-store.ts
      protocol/
        agent-ui-event.ts
        run-api-types.ts
    test/
      agent/
      state/
      llm/
      tools/
      context/
      prompts/
      sessions/
      protocol/
      e2e/
apps/
  cli/
    src/
      main.ts
      commands/run.ts
examples/
  minimal-cli/
  custom-tool/
  custom-provider/
```

`packages/core` 的公开 API 应该从第一天就收紧：

- `createAgent()`：创建 agent runtime。
- `AgentLoop` 或 `AgentRuntime`：运行 turn / run。
- `LLMClient`：由宿主项目注入模型能力。
- `ToolDefinition`、`ToolRegistry`：由宿主项目注册工具。
- `ConversationState`：可序列化、可恢复的状态对象。
- `AgentEvent`：宿主项目消费 runtime 事件。
- `PermissionHandler`：宿主项目决定如何批准/拒绝。
- `SessionStore`、`EventStore` 接口：core 定义合同，宿主项目选择内存、文件或数据库实现。

### Core 依赖原则

`packages/core` 必须保持可嵌入：

- 不依赖 Web 框架。
- 不依赖 CLI 框架。
- 不依赖具体数据库。
- 不直接读取全局配置文件，配置由宿主传入。
- 不绑定具体 provider SDK 类型，provider adapter 只实现 `LLMClient`。
- 不假设运行环境是 Node CLI；后续 server/worker 也应能引用。

### Provider 和工具包的演进

M0-M2 可以把一个内置 provider adapter 和少量 builtin tools 放在 `packages/core/src/llm`、`packages/core/src/tools/builtins`，方便快速验证。等到出现复用压力后，再拆成独立包：

```text
packages/
  core/
  provider-openai/
  provider-anthropic/
  provider-gemini/
  tools-filesystem/
  tools-shell/
  protocol-http/
  adapter-acp/
apps/
  cli/
  server/
  web/
```

拆包触发条件：

- 两个以上项目需要引用同一个 provider adapter。
- builtin tool 需要单独版本、权限策略或 sandbox 依赖。
- Web/Server 需要 HTTP/SSE 协议，但 core 不应引入 server 依赖。
- SDK 用户需要只安装 core，不安装所有 providers/tools。

### 为什么不是先做完整应用

Guga 的核心价值是 runtime 可复用。先做完整 Web/CLI 应用容易把业务入口、UI 状态、模型调用和工具执行耦在一起，后续其他项目引用时只能复制代码。core-first 的结果应该是：

- 其他项目可以 `import { createAgent } from "@guga-agent/core"`。
- 其他项目可以注入自己的 `LLMClient`、tools、permission handler、event store。
- Guga 自己的 CLI/Web 只是示范 adapter，而不是唯一运行方式。
- M5 之后的 Web UI 消费 `AgentEvent`/`AgentUIEvent`，不反向污染 core。

## 贯穿所有阶段的设计约束

- **模型输入是投影，不是事实源。** 完整事实源应该是 event log、tool result store、artifact store 和 prompt/context source metadata。
- **工具行动由 runtime 授权，不由模型授权。** 模型可以提出意图和理由，但不能决定危险操作是否执行。
- **summary 是续航手段，不是历史替代品。** compact 后仍要保留原始事件和 boundary。
- **provider 差异不能泄漏到 agent loop。** loop 只消费内部 `LLMEvent`、`ModelTurnOutput` 和 normalized error。
- **UI 消费 runtime facts，不猜字符串。** tool started、permission requested、context compacted、usage updated 都应该是事件。
- **每个阶段都要能单独验收。** 没有退出标准的阶段不算完成。

## M0：技术验证版

**目标：** 证明最小 agent 可以完成“用户输入 -> 模型 -> 工具 -> 模型 -> 最终回答”的闭环。

### 用户可见结果

用户可以在 CLI 中输入一句话，例如“读取 README 并总结”，agent 能调用一个只读工具读取文件，并基于结果回答。

### 建设范围

实现最小但合法的消息协议：

- `system` message：固定系统提示词。
- `user` message：用户输入。
- `assistant` message：模型文本或 tool calls。
- `tool` message：带 `tool_call_id` 的工具结果。

实现一个 provider-backed 模型调用：

- 只支持一个 provider。
- 支持普通文本输出。
- 支持 tool calling。
- 支持 `AbortSignal`。
- 记录原始 usage，如果 provider 不返回则允许为空。

实现一个只读工具：

- `read_file({ path })`。
- 只能读取工作区内文件。
- 失败时返回结构化 observation，而不是抛穿主循环。

### 建议实现单元

- `apps/cli/src/commands/run.ts`：接收用户输入，启动一次 agent run。
- `packages/core/src/llm/llm-client.ts`：定义 `LLMClient` 接口。
- `packages/core/src/llm/providers/openai-client.ts`：第一版 provider adapter。
- `packages/core/src/agent/agent-loop.ts`：最小 while loop。
- `packages/core/src/tools/builtins/read-file.ts`：只读工具。
- `packages/core/src/tools/tool-definition.ts`：最小工具类型。

### 核心类型草案

这些类型是方向约束，不要求逐字照写：

```ts
type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

type ToolObservation = {
  ok: boolean;
  content: string;
  error?: { code: string; message: string };
};
```

### 测试清单

- `packages/core/test/e2e/minimal-tool-loop.test.ts`：模型返回 `read_file` tool call 后，工具结果能进入下一轮模型输入。
- `packages/core/test/agent/tool-pairing.test.ts`：每个 `tool` message 都能找到对应 assistant tool call。
- `packages/core/test/tools/read-file.test.ts`：读取存在文件、读取不存在文件、拒绝工作区外路径。
- `packages/core/test/llm/abort.test.ts`：取消信号能中断模型调用。

### 退出标准

- 能跑一次真实 CLI demo。
- 能打印最终 messages 并确认顺序合法。
- 工具失败不会导致 agent loop 崩溃。
- 没有 provider SDK 类型穿透到工具层。

### 不做

- 不做 streaming。
- 不做权限弹窗。
- 不做 event store。
- 不做 compaction。
- 不做多 provider。

### 主要风险

- 过早开放 shell，导致安全边界还没建立就有副作用能力。
- 用正则解析 `Action/Observation` 文本，而不是使用模型原生 tool call。
- 工具直接修改 messages，导致后续 loop 无法统一治理。

## M1：最小 Agent Runtime

**目标：** 把 M0 的闭环升级为可维护 runtime，建立后续所有阶段的承重骨架。

### 用户可见结果

用户仍然使用 CLI，但 agent 现在能稳定处理多轮对话、工具失败、无工具结束、max turns 和用户取消。

### 建设范围

引入五个核心对象：

- `AgentLoop`：运行 turn，决定继续或结束。
- `ConversationState`：拆分 `systemMessages / history / pending`。
- `LoopController`：处理 `continue / finish / abort / error / max_turns`。
- `ToolRegistry`：工具 schema、描述、execute 的单一声明源。
- `PromptBuilder`：从 base、environment、tools、context 生成系统提示词。

### 建议实现单元

- `packages/core/src/state/conversation-state.ts`
- `packages/core/src/agent/loop-controller.ts`
- `packages/core/src/events/agent-event.ts`
- `packages/core/src/tools/tool-registry.ts`
- `packages/core/src/tools/tool-executor.ts`
- `packages/core/src/prompts/prompt-builder.ts`

### 关键决策

- `ConversationState.toModelMessages()` 是唯一模型输入出口。
- `systemMessages` 不进入可压缩历史。
- `pending` 保存当前轮 assistant tool calls 和 tool results，在提交前不能被 compact 或裁剪。
- tool result 写回由 `AgentLoop` 统一负责，工具函数只返回 `ToolResult`。
- PromptBuilder 不调用模型、不改写历史，只负责装配提示词和记录 sources。

### 事件最小集

M1 不需要完整协议，但 runtime 内部应该开始发事件：

- `agent.started`
- `turn.started`
- `model.completed`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `turn.completed`
- `agent.completed`
- `agent.failed`

### 测试清单

- `packages/core/test/state/conversation-state.test.ts`
  - system/history/pending 顺序正确。
  - pending commit 后进入 history。
  - replace history 不影响 system。
- `packages/core/test/agent/agent-loop.test.ts`
  - 无工具时结束。
  - 有工具时继续下一轮。
  - 工具失败作为 observation 回到模型。
  - max turns 返回明确原因。
- `packages/core/test/tools/tool-registry.test.ts`
  - 注册、重复注册、按名称查找、列出模型可见工具。
- `packages/core/test/prompts/prompt-builder.test.ts`
  - 启用/禁用工具时，工具说明同步变化。

### 退出标准

- `AgentLoop` 不依赖具体 provider SDK。
- 工具 schema 与 execute 来自同一 `ToolDefinition`。
- 任意测试中的 tool result 都有对应 tool call id。
- agent 可以被取消，并且不会继续执行排队工具。

### 不做

- 不做复杂权限。
- 不做并发工具执行。
- 不做 provider marketplace。
- 不做长期记忆。

### 主要风险

- 把 prompt、history、tools 都塞进一个大字符串，后续无法做 context projection。
- 在 loop 里散写退出条件，后续 compaction/retry/cancel 会互相打架。

## M2：工具安全与权限系统

**目标：** 让 agent 能执行真实动作，同时建立商业级安全底线。

### 用户可见结果

当 agent 想写文件、执行命令或访问外部系统时，runtime 会根据模式自动允许、拒绝或请求确认。拒绝后 agent 能继续解释原因，而不是挂死。

### 建设范围

扩展工具定义：

```ts
type ToolEffect = "read" | "write" | "execute" | "external";
type PermissionMode = "default" | "plan" | "auto-edit" | "yolo";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
  effect: ToolEffect;
  defaultPermission: "auto" | "ask" | "deny";
  concurrency: "safe" | "exclusive";
  resultBudget: number;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
};
```

引入执行管道：

- 参数校验。
- 参数修复或规范化。
- 权限检查。
- 路径安全检查。
- timeout。
- abort。
- tool execution。
- result normalization。
- audit record。

### 建议实现单元

- `packages/core/src/tools/execution/execution-pipeline.ts`
- `packages/core/src/tools/permissions/permission-manager.ts`
- `packages/core/src/tools/permissions/path-safety.ts`
- `packages/core/src/tools/tool-result.ts`
- `packages/core/src/tools/audit.ts`
- `packages/core/src/tools/builtins/write-file.ts`
- `packages/core/src/tools/builtins/shell.ts`，可以先只支持白名单命令。

### 权限策略

- `read`：默认自动允许，但仍受路径安全限制。
- `write`：`default` 模式请求确认，`plan` 模式拒绝，`auto-edit` 模式允许工作区内普通写入。
- `execute`：默认请求确认，危险命令硬拒绝或强确认。
- `external`：默认请求确认，后续接企业策略。

`allow always` 必须明确作用域：

- `once`：只批准当前 request。
- `session`：只在当前 session 有效。
- `always`：持久化前必须有明确产品入口，M2 可以先不做持久化。
- `deny`：返回结构化 tool result。

### 测试清单

- `packages/core/test/tools/permission-manager.test.ts`
  - plan 模式拒绝 write/execute。
  - auto-edit 允许工作区内写入。
  - default 模式对 write/execute 生成 permission request。
- `packages/core/test/tools/path-safety.test.ts`
  - 拒绝 `../` 越界。
  - 拒绝读取常见密钥文件。
  - 允许工作区内普通路径。
- `packages/core/test/tools/execution-pipeline.test.ts`
  - timeout 返回 structured error。
  - abort 返回 cancelled/error result。
  - 工具抛异常不会炸穿 loop。
- `packages/core/test/e2e/permission-denied.test.ts`
  - 权限拒绝后，模型收到 observation 并解释下一步。

### 退出标准

- 所有副作用工具都经过 `ExecutionPipeline`。
- 权限请求有 `requestId`、`runId`、`callId`、tool name、input、risk summary。
- 权限拒绝、取消、超时都能回流为 tool result。
- audit record 覆盖每次工具调用。

### 不做

- 不做复杂企业策略。
- 不做远端权限桥接。
- 不做并发调度。
- 不做 MCP 动态工具。

### 主要风险

- 只在 UI 层隐藏危险工具，runtime 仍可执行。
- 把权限弹窗写进具体工具，导致 CLI/API/IDE 无法复用。
- 把 session allow always 偷偷持久化为全局允许。

## M3：上下文与长任务生存能力

**目标：** 让 agent 能跑长任务，遇到大输出、超窗、截断时可以恢复。

### 用户可见结果

agent 在处理大日志、长文件、多轮工具调用时不会直接失败；当上下文接近上限时，会显示正在压缩，并在压缩后继续当前任务。

### 建设范围

引入四个 context 子系统：

- `ContextBudgeter`：计算当前模型可用 input、预留 output、压缩阈值。
- `ToolResultStore`：大工具结果落盘，只给模型 preview 和引用。
- `OutputTruncator`：按命令/工具类型保留 head/tail 和关键错误行。
- `CompactionService`：生成 summary、保留 recent tail、记录 pre/post token 和 boundary。

### 建议实现单元

- `packages/core/src/context/context-budgeter.ts`
- `packages/core/src/context/output-truncator.ts`
- `packages/core/src/context/tool-result-store.ts`
- `packages/core/src/context/compaction-service.ts`
- `packages/core/src/context/compaction-message.ts`
- `packages/core/src/context/token-estimator.ts`

### 工具输出治理规则

- shell/test/lint 输出：保留失败摘要、错误行、最后 N 行。
- search 输出：保留匹配数量、前 N 个结果、可重读 query。
- file read 输出：超过预算时返回片段和路径引用。
- 大于阈值的 tool result：写入 `ToolResultStore`，模型只看到 artifact id、path、head/tail preview 和重读方式。

### Compaction 规则

压缩结果必须保留：

- 用户原始目标。
- 明确约束和不做什么。
- 已完成步骤。
- 当前阻塞点。
- 关键文件路径。
- 工具调用重要结果。
- 下一步建议。

压缩不能改写：

- root system prompt。
- 当前 pending tool calls。
- 当前 pending tool results。
- 未闭合 tool call/tool result 配对。

### 测试清单

- `packages/core/test/context/output-truncator.test.ts`
  - 大日志不会完整进入模型。
  - 测试失败关键错误行不被截掉。
- `packages/core/test/context/tool-result-store.test.ts`
  - 大结果落盘后返回 preview 和可重读引用。
  - artifact id 能定位原始结果。
- `packages/core/test/context/compaction-service.test.ts`
  - compact 后 system 不变。
  - pending 不丢失。
  - summary 包含目标、约束、进度、下一步。
- `packages/core/test/e2e/context-overflow-retry.test.ts`
  - 模拟 provider context overflow，触发 compact 并重试同一轮。

### 退出标准

- 大结果不会直接进入模型输入。
- overflow 是可恢复分支，不是普通失败。
- 每次 compaction 都产生 event 和 audit metadata。
- 压缩前后 token 估算或真实 usage 可记录。

### 不做

- 不做长期记忆。
- 不做向量库。
- 不做跨 session search。
- 不做复杂 context eval 平台。

### 主要风险

- 把 summary 当成唯一历史，丢掉原始事件。
- 静默压缩，让用户和 UI 不知道历史发生过边界变化。
- 压缩破坏 tool call/tool result 配对。

## M4：事件账本与 Session 恢复

**目标：** 把内存 agent 变成可恢复、可回放、可审计的产品系统。

### 用户可见结果

进程重启或页面刷新后，用户可以恢复 session，看到之前的消息、工具状态、artifact、compact boundary 和错误。

### 建设范围

建立 append-only event log：

```ts
type AgentEventRecord = {
  id: string;
  seq: number;
  sessionId: string;
  runId: string;
  type: string;
  payload: unknown;
  createdAt: string;
};
```

事件类型至少包括：

- `session.created`
- `run.started`
- `turn.started`
- `message.created`
- `message.delta`
- `message.completed`
- `tool.started`
- `tool.completed`
- `tool.failed`
- `permission.requested`
- `permission.resolved`
- `artifact.created`
- `usage.recorded`
- `context.compacting`
- `context.compacted`
- `run.completed`
- `run.failed`
- `run.cancelled`

### 建议实现单元

- `packages/core/src/sessions/event-store.ts`
- `packages/core/src/sessions/session-store.ts`
- `packages/core/src/sessions/projections.ts`
- `packages/core/src/context/context-assembler.ts`
- `packages/core/src/artifacts/artifact-store.ts`
- `packages/core/src/sessions/replay.ts`

### Projection

从 event log 派生三类投影：

- `ConversationProjection`：UI 展示消息、tool parts、compact boundary。
- `ModelInputProjection`：某一轮模型实际看到的 messages 和 sources。
- `AuditProjection`：工具调用、权限、usage、error、artifact 的链路。

### 恢复流程

1. 根据 `sessionId` 读取 event log。
2. `ContextAssembler` 重建 `ConversationState`。
3. 未完成 run 标记为 interrupted 或 resumable。
4. 如果存在 pending permission，恢复为可继续等待或取消。
5. 下一轮模型输入通过 projection 重新生成，不直接读取旧 prompt 字符串。

### 测试清单

- `packages/core/test/sessions/event-store.test.ts`
  - seq 递增。
  - 同一 run 事件顺序稳定。
  - append-only，不允许覆盖历史事件。
- `packages/core/test/context/context-assembler.test.ts`
  - 从事件重建 system/history/pending。
  - compact boundary 后仍能恢复 summary 和 recent tail。
- `packages/core/test/e2e/session-resume.test.ts`
  - 模拟进程重启后继续对话。
- `packages/core/test/e2e/replay-model-input.test.ts`
  - 某一轮模型输入可重建并与记录一致。

### 退出标准

- session 不依赖进程内存才能继续。
- 每次模型调用都能追踪输入来源。
- 每个 tool call 都能关联 permission、result、artifact、usage/error。
- compact summary 不是唯一事实源。

### 不做

- 不做企业 dashboard。
- 不做跨设备协作。
- 不做事件版本迁移平台。

### 主要风险

- 只保存最终 assistant 文本，丢掉工具状态和错误。
- 把 event log 和 UI projection 混成一个表，后续无法 replay。
- 不记录 model input projection，线上问题无法复盘。

## M5：Web UI 与 Agent Protocol

**目标：** 让 runtime 通过稳定协议服务 Web UI，并为 CLI、IDE、API、IM 适配打基础。

### 用户可见结果

用户可以在 Web UI 中发起 run，看到模型流式输出、工具进度、权限请求、artifact、usage 和 compact boundary，并能取消或等待 run。

### 建设范围

定义 canonical `AgentUIEvent`：

```ts
type AgentUIEvent =
  | { type: "run.started"; runId: string; sessionId: string; seq: number }
  | { type: "message.delta"; runId: string; messageId: string; text: string; seq: number }
  | { type: "message.completed"; runId: string; messageId: string; seq: number }
  | { type: "tool.started"; runId: string; callId: string; name: string; seq: number }
  | { type: "tool.completed"; runId: string; callId: string; outputPreview: string; seq: number }
  | { type: "tool.failed"; runId: string; callId: string; error: string; seq: number }
  | { type: "permission.requested"; runId: string; requestId: string; callId: string; seq: number }
  | { type: "artifact.created"; runId: string; artifactId: string; filename: string; mime: string; seq: number }
  | { type: "context.compacting"; runId: string; reason: string; seq: number }
  | { type: "context.compacted"; runId: string; summaryId: string; seq: number }
  | { type: "usage.updated"; runId: string; inputTokens?: number; outputTokens?: number; cost?: number; seq: number }
  | { type: "run.completed"; runId: string; seq: number }
  | { type: "run.failed"; runId: string; error: string; seq: number };
```

### API 面

第一版建议：

- `POST /sessions`：创建 session。
- `GET /sessions/:sessionId`：读取 session projection。
- `POST /sessions/:sessionId/runs/stream`：创建 run 并返回 SSE。
- `GET /runs/:runId`：读取 run 状态。
- `GET /runs/:runId/events?afterSeq=`：读取事件，用于断线恢复。
- `POST /runs/:runId/cancel`：取消 run。
- `POST /permissions/:requestId/approve`：批准权限。
- `POST /permissions/:requestId/deny`：拒绝权限。
- `GET /artifacts/:artifactId`：下载 artifact。

### UI 页面

- Session 列表页。
- Run 详情页。
- Message stream 区。
- Tool timeline。
- Permission prompt。
- Artifact list。
- Usage summary。
- Compact boundary 展示。

### 建议实现单元

- `packages/core/src/protocol/agent-ui-event.ts`
- `apps/server/src/sse.ts`
- `apps/server/src/run-api.ts`
- `apps/server/src/permission-api.ts`
- `packages/core/src/artifacts/artifact-store.ts`
- `apps/web/src/*`

### 测试清单

- `packages/core/test/protocol/agent-ui-event.test.ts`
  - internal events 能投影为稳定 UI events。
  - seq 单调递增。
- `apps/server/test/sse.test.ts`
  - message delta、tool state、run completed 能通过 SSE 收到。
- `apps/server/test/e2e/cancel-run.test.ts`
  - cancel 会停止模型调用和工具执行。
- `apps/server/test/e2e/permission-flow.test.ts`
  - UI approve/deny 能解除 pending permission。
- `apps/server/test/e2e/artifact-download.test.ts`
  - artifact 创建后可下载，且带正确 mime/filename。

### 退出标准

- 浏览器刷新后能恢复 run 状态。
- UI 不依赖字符串猜测工具状态。
- cancel 不是只改 loading 状态，而是传播到 runtime。
- artifact 是资源，不只是回答里的 markdown 链接。

### 不做

- 不做多用户协作。
- 不做复杂企业权限。
- 不做 WebSocket，除非第一客户明确需要双向低延迟控制。

### 主要风险

- 把内部事件名直接暴露为公共 API，后续无法演进。
- SSE 断开后没有 events endpoint 恢复。
- 权限只做前端弹窗，服务端没有 pending request。

## M6：多 Provider 运营

**目标：** 把模型接入从硬编码 adapter 变成可运营能力。

### 用户可见结果

用户或管理员可以配置 provider、模型、API key、fallback 策略；同一个 agent 可以在不同模型之间切换，并能看到 token、成本和错误原因。

### 建设范围

Provider 层拆成三部分：

- `ProviderProfile`：声明认证方式、base URL、默认模型、能力和模型发现方法。
- `LLMClientAdapter`：把内部 messages/tools/schema 转成 provider 请求，把 provider stream 转回内部事件。
- `ModelCapabilityRegistry`：记录模型是否支持 tool calling、parallel tools、JSON schema、reasoning、vision、context limit、output limit、stream usage。

### 建议实现单元

- `packages/core/src/llm/provider-registry.ts`
- `packages/core/src/llm/provider-profile.ts`
- `packages/core/src/llm/model-capabilities.ts`
- `packages/core/src/llm/providers/openai-client.ts`
- `packages/core/src/llm/providers/anthropic-client.ts`
- `packages/core/src/llm/providers/gemini-client.ts`
- `packages/core/src/llm/provider-errors.ts`
- `packages/core/src/llm/cost-tracker.ts`

### 错误类型

至少归一化：

- `ContextOverflowError`
- `RateLimitError`
- `AuthenticationError`
- `AbortError`
- `ToolCallParseError`
- `ModelNotFoundError`
- `UnsupportedCapabilityError`
- `UnknownProviderError`

### 测试清单

- `packages/core/test/llm/provider-registry.test.ts`
  - 注册 provider、覆盖 provider、禁用 provider。
- `packages/core/test/llm/model-capabilities.test.ts`
  - 不支持 tool calling 时拒绝工具请求。
  - 不支持 media tool result 时降级为文本引用。
- `packages/core/test/llm/provider-errors.test.ts`
  - provider 原始错误归一化为内部错误类型。
- `packages/core/test/e2e/provider-switch.test.ts`
  - 同一 agent run 可以切换 provider adapter。

### 退出标准

- agent loop 不知道当前 provider 是谁。
- provider 不支持能力时明确失败或降级。
- token/cost 可按 run/session 聚合。
- rate limit、auth、overflow、abort 不再混成普通 error。

### 不做

- 不做公开 provider marketplace。
- 不做用户插件 provider。
- 不做复杂价格同步系统。

### 主要风险

- 用 provider 名称代替 capability 判断。
- 把 provider SDK event 暴露给 runtime/UI。
- 错误只保留 message 字符串，导致 retry/fallback 无法决策。

## M7：商业平台

**目标：** 把 runtime 包装成企业可采用的 agent platform。

### 用户可见结果

企业团队可以管理 workspace、成员、provider key、工具权限、审计日志、prompt 版本、run replay、artifact 和 eval；agent 可以服务 CLI、Web、IDE、API 等多个入口。

### 建设范围

平台能力分为六块：

- **Workspace 和租户**：workspace、project、user、role、policy。
- **Provider 管理**：key vault、provider profile、model allowlist、fallback。
- **Tool 管理**：工具开关、MCP server、权限策略、危险命令策略。
- **Prompt 管理**：base prompt 版本、项目规则、实验、diff、审计。
- **Run 运营**：session/run 列表、event replay、usage/cost、error 分类。
- **质量体系**：eval dataset、regression suite、runtime boundary tests。

### 建议实现单元

- `packages/platform/src/workspaces.ts`
- `packages/platform/src/users.ts`
- `packages/platform/src/policies.ts`
- `packages/platform/src/provider-admin.ts`
- `packages/platform/src/tool-admin.ts`
- `packages/platform/src/prompt-versions.ts`
- `packages/platform/src/evals.ts`
- `packages/platform/src/audit-export.ts`

### 企业级数据对象

- `Workspace`
- `Project`
- `User`
- `Role`
- `Policy`
- `ProviderCredential`
- `ModelAllowlist`
- `ToolPolicy`
- `PromptVersion`
- `EvalRun`
- `AuditExport`

### 测试清单

- `packages/platform/test/policies.test.ts`
  - workspace policy 能覆盖工具默认权限。
  - model allowlist 能拒绝未授权模型。
- `packages/platform/test/audit-export.test.ts`
  - 导出内容包含 run、model input projection、tool calls、permissions、artifacts、usage。
- `packages/platform/test/prompt-versions.test.ts`
  - prompt version 可回放，可 diff。
- `packages/platform/test/e2e/enterprise-run.test.ts`
  - 企业策略下的完整 run 能执行、审批、产出 artifact、记录 audit。

### 退出标准

- 企业能控制模型、工具、权限、日志和数据边界。
- 长任务可以跨天恢复。
- 每次模型调用都可以按 prompt、context source、model 和 tool state 审计。
- 新工具、新模型、新客户端可以通过 adapter 接入，而不是修改主循环。

### 不做

- 不做与核心 runtime 无关的重型 BI。
- 不做脱离 eval 的 prompt 实验平台。
- 不做没有权限模型支撑的 marketplace。

### 主要风险

- 在 M4/M5 不稳定时过早做后台，结果只能展示不可靠数据。
- 把企业策略只做成 UI 配置，没有在 runtime 层强制执行。
- 没有 eval 和 replay，prompt/provider 改动无法安全上线。

## 跨阶段依赖图

```text
M0 工具闭环
  -> M1 Runtime 骨架
    -> M2 权限与执行管道
    -> M3 Context 生存能力
      -> M4 Event Log 与恢复
        -> M5 UI Protocol
          -> M6 Provider 运营
            -> M7 商业平台
```

注意：M2 和 M3 可以部分并行，但必须都建立在 M1 的 `AgentLoop`、`ConversationState`、`ToolRegistry` 之上。M5 必须等 M4 至少有可用 event store，否则 UI 只能消费临时状态，刷新和断线都会丢上下文。

## 第一阶段任务拆解

如果现在开始实现，建议把第一批任务拆成下面 12 个 issue：

1. 定义 core message、tool call、tool result、usage 类型。
2. 实现 `LLMClient` 接口和一个 provider adapter。
3. 实现最小 `read_file` 工具。
4. 实现 `AgentLoop` 的 no-tool finish 和 tool-call continue。
5. 实现 tool result 与 tool call id 配对测试。
6. 实现 `ConversationState` 的 system/history/pending 分层。
7. 实现 `ToolRegistry`，让 schema、description、execute 来自同一声明源。
8. 实现 `PromptBuilder` 四层装配：base、environment、tools、context。
9. 实现 max turns 和 abort。
10. 实现基础 runtime events。
11. 实现 CLI `run` 命令。
12. 添加 M0/M1 e2e 测试：读取文件、工具失败、无工具结束、取消、max turns。

## 排序规则

- 先做一个可靠 agent，再做多 agent 编排。
- 先做 event log，再做企业 dashboard。
- 先做 session recovery，再做长期记忆。
- 先做 provider adapter，再做 provider marketplace。
- 先做 permission runtime，再做 permission UI polish。
- 先做 artifact resource，再做复杂文件图库。
- 先做 replay，再做 prompt experiment。
- 先做 tool result budget，再做更强工具生态。

## 判断一个阶段是否“足够商业级”

每个阶段结束时都问四个问题：

- **可恢复吗？** 失败、取消、重启、超时后是否有明确状态。
- **可审计吗？** 能否知道模型看到了什么、工具做了什么、谁批准了什么。
- **可替换吗？** provider、tool、client 是否可以通过 adapter 替换，而不是改核心 loop。
- **可测试吗？** 是否有覆盖关键边界的自动化测试，而不是只靠 demo。

如果答案是否定的，不要进入更高层平台化。商业级 agent 的壁垒不是“功能多”，而是边界稳。
