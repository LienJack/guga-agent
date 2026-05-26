# M3 Tool Plugins And Permission Runtime

## 目标

实现 `docs/roadmap.md` 中的 M3：让 Guga runtime 能通过插件贡献的工具安全执行真实动作，同时由 core 统一控制校验、hook、权限决策、并发、执行、结果归一化和审计事件。本任务要把现有最小工具契约扩展成可用的工具 runtime，并交付 first-party filesystem、shell 和 git 辅助能力。

## 已知信息

* 产品方向是小内核、强插件生态、可审计 runtime，以及以事件作为事实源。
* 已确认的需求文档是 `docs/brainstorms/2026-05-26-m3-tool-plugins-permission-runtime-requirements.md`。
* M3 依赖 M1 的 plugin host / hook kernel，以及 M2 的 provider bridge 行为。
* 当前 `packages/core` 已经有 provider-neutral contracts、capability registry、event bus、conversation state、provider router、plugin host 和最小 agent loop。
* 当前 `ToolDefinition` 只覆盖 name、description、input schema、effect 和 execute；M3 必须扩展工具周边的 runtime 面，而不是假设这些能力已经存在。
* 当前工具事件仍然很小，只有 `tool.called` 和 `tool.result`；M3 需要更丰富的 lifecycle、permission 和 audit 事件。
* 当前 hook surface 包含 `pre_tool.gate`，但 M3 需要包含 gate、execute 和 result phase 的完整执行管线。
* 当前 core 不包含 filesystem、shell、browser、git、MCP、durable session store、artifact store、context compaction 或 UI projection。

## 假设

* M3 是实现任务，不是继续做产品 brainstorm。除非代码探索发现矛盾，否则沿用已确认需求文档中的范围决策。
* 实现应继续使用 TypeScript，并优先遵循现有 package 结构，除非规划阶段发现更适合当前仓库的模式。
* 第一版实现应偏向聚焦的 core 改动加 first-party package/module，而不是一次性做大应用外壳。
* 远端 sandbox provider、MCP、browser tools 和企业 policy 都保持在范围外。

## 需求

* 定义 core-owned tool runtime contract，独立于 provider bridge 和具体 host UI。
* 扩展 tool definition，使其足以表达 permission metadata、execution mode、result budget、renderer metadata，以及资源/并发安全信息。
* 实现统一 ExecutionPipeline，覆盖 tool lookup、schema validation、argument preparation、pre-tool hooks、permission、timeout/abort、execution、result normalization、post-tool hooks、result return 和 audit events。
* 确保 provider bridge 只返回 tool intent；工具执行必须发生在 Guga runtime 内。
* 实现 allow / ask / deny 权限语义，包括单次 allow/deny 与 session 级 always allow / always reject。
* 所有有副作用的工具都必须在真实执行前经过 permission runtime。
* 被拒绝、取消、超时、参数无效和执行失败的工具调用都必须返回结构化 tool result，而不是让 agent loop 崩溃。
* 加入保守并发处理：未知工具默认不可并发；path/resource scoped 写操作在 scope 重叠时不得并发执行。
* 提供 first-party filesystem 工具，覆盖 read、write、edit、search、list/find 等核心 coding-agent 工作流，并受 workspace/root containment 约束。
* 提供 first-party shell execution，默认采用 ask 权限。
* 提供 first-party git 辅助能力，覆盖 status、diff 和 commit 辅助；危险历史改写和 push 不在范围内。
* 加入 result budgeting，避免大工具输出未经控制地进入模型输入；需要截断、摘要、artifact reference 或明确提示输出已缩减。
* 发出足够支撑未来 context policy、replay 和 host adapters 重建工具行为的 lifecycle / audit events。
* 保留插件灵活性：插件可以贡献工具并参与 hooks，但最终执行权和决策落账属于 core。

## 验收标准

* [ ] 自定义插件可以注册工具，该工具能通过统一 registry 可见，并通过新 execution pipeline 执行。
* [ ] provider 产生的 tool intent 会进入 Guga 工具执行流程；provider bridge 不直接执行工具。
* [ ] 需要 ask 的 shell tool call 会创建 permission request，并且只在 allow 后执行。
* [ ] deny 或 always reject 决策会成为模型可见的结构化 tool result，并能在 runtime events 中观察到。
* [ ] pre-tool gate hook 可以阻断执行，并且 block decision 可观察。
* [ ] post-tool/result hook 可以 annotate 或 truncate result，但不能隐藏原始工具失败状态。
* [ ] filesystem 工具不能访问声明 workspace/root 之外的路径。
* [ ] 重叠路径上的并发 path-scoped 写操作不会并行运行。
* [ ] 大工具输出会被预算约束，并以可见的截断或引用形式呈现，而不是直接塞进模型可见内容。
* [ ] Runtime events 覆盖工具 lifecycle、permission decisions、hook decisions/failures 和最终 result status。
* [ ] 现有 M0/M1/M2 测试继续通过。
* [ ] 新测试覆盖成功路径、permission deny、hook block、工具失败、可行范围内的 timeout/abort、result budget 和 path conflict 行为。

## 完成定义

* 为 core contracts、execution pipeline、permission runtime、first-party tools，以及与 agent loop/provider bridge 的集成添加或更新测试。
* lint、typecheck 和 package tests 通过。
* 如果 public contract 或 package 行为变化，更新相关 docs 或 README。
* 范围排除项保持明确，不以隐藏的半成品行为混入实现。
* 如果实现过程中发现应指导未来 agent 的新模式或约定，写入 `.trellis/spec/`。

## 范围外

* Browser tools。
* MCP tool integration。
* 远端 sandbox provider、sandbox marketplace 或完整执行环境 provider 体系。
* 企业级 policy engine、插件签名、trust tiers、allowlists 或 marketplace governance。
* 完整 context compaction、durable tool result store、长期记忆或 semantic memory。
* 具体 CLI/Web/IDE permission dialog UI。
* Multi-agent delegation。
* 危险 git 历史改写、远端 push、credential management 或复杂 git workflow automation。

## 技术方向

M3 应拆成一组小而可测试的增量：

* Contract expansion：演进 tool、permission、event 和 hook contracts，同时保持 provider-neutral core 边界。
* Pipeline extraction：让每个 tool intent 都通过单一 execution pipeline，而不是把 permission 和 result handling 分散到各个工具里。
* Permission runtime：加入一等 allow / ask / deny decisions，以及 session-scoped remembered decisions。
* First-party tools：用与 plugin tools 相同的 tool contract 实现 filesystem、shell 和 git helpers。
* Safety and observability：加入保守并发、result budgeting、root containment 和 lifecycle/audit events。

具体 API 形状、package 位置和 event payload 细节应在规划阶段基于当前代码库决定。

## 决策（ADR-lite）

**背景：** Guga 必须从模型/provider 接入迈向真实世界动作。现有 core 只有最小 tool function contract 和 pre-tool gate，但在 filesystem、shell 和 git 工具变成真实能力之前，M3 需要建立 runtime 级安全边界。

**决策：** Core 拥有 execution pipeline 和 permission runtime。插件贡献工具和 hooks，但模型/工具执行始终流经 core 管理的 validation、permission、execution、result normalization 和 events。

**影响：** 这比把工具注册成普通函数更重，但能保留 Guga 的核心承诺：动作可审计、有权限边界、适合 replay，并且不绑定 provider 或 host。它也保留了 pi 式扩展性，同时避免 pi 的 extension-only permission model。

## 研究引用

* `docs/research/context-packs/tool-registry.md` — 跨项目工具 registry、permission、hooks、MCP、skills 和 result handling 模式。
* `docs/research/context-packs/agent-loop.md` — 工具调度、失败回流、路径冲突检测和消息配对影响。
* `docs/research/context-packs/multi-agent.md` — 未来阶段的 permission inheritance 和 tool boundary 经验；M3 不实现 multi-agent。
* `docs/brainstorms/2026-05-26-m1-plugin-host-hook-kernel-requirements.md` — M1 依赖：plugin host、capability registry 和 hook kernel。
* `docs/brainstorms/2026-05-26-m2-provider-ai-sdk-bridge-requirements.md` — M2 依赖：provider bridge 返回 tool intent，但不执行工具。
* `docs/brainstorms/2026-05-26-m3-tool-plugins-permission-runtime-requirements.md` — 已确认的 M3 产品需求。

## 技术笔记

* 可能主要影响 `packages/core`，是否新增 first-party tool plugin packages/modules 留给规划阶段决定。
* 当前相关 contracts 包括 `packages/core/src/contracts/tools.ts`、`events.ts`、`hooks.ts`、`messages.ts`、`provider.ts` 和 `model-events.ts`。
* 当前相关 runtime 模块包括 `packages/core/src/loop/agent-loop.ts`、`registry/capability-registry.ts`、`hooks/hook-kernel.ts`、`plugin-host/plugin-host.ts` 和 `runtime/agent-runtime.ts`。
* 现有 package docs 明确说明 core 当前不包含真实 filesystem、shell、browser、git、MCP、durable session store、artifact store、context compaction 和 UI projection。
* 实现前应加载 backend guidelines 和 cross-layer thinking guides，因为本任务会同时改变 core、runtime、tests、provider bridge 和未来 host/plugin layers 的契约。

## 开放问题

* 延后到规划：tool metadata、permission metadata、result budgeting 和 renderer metadata 的最小稳定 contract 应该是什么？
* 延后到规划：M3 的 first-party filesystem/shell/git 工具应放在 `packages/core` 内，还是放在依赖 core 的独立 plugin packages？
* 延后到规划：哪些 event name 和 payload 粒度最贴合现有 M1/M2 event style？
* 延后到规划：root containment 应如何处理 symlinks、hidden files、relative paths 和平台差异？
