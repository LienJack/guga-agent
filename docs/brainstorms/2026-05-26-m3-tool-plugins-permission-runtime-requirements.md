---
date: 2026-05-26
topic: m3-tool-plugins-permission-runtime
---

# M3 Tool Plugins And Permission Runtime 需求文档

## Summary

M3 要让 Guga runtime 能安全执行真实动作：工具由插件贡献，模型只提出 tool intent，core 通过统一执行管线完成校验、hook gate、权限、并发调度、执行、结果归一化和审计。这个里程碑同时交付一组足够支撑 coding-agent 工作流的 first-party 工具，但真正的产品面是可插拔、可审计、fail-closed 的工具执行与权限 runtime。

---

## Problem Frame

M2 让 Guga 可以通过 provider bridge 接入真实模型，并把模型输出归一化为 Guga 自己的 runtime 事件。下一层风险是工具：一旦模型可以读写文件、执行 shell、辅助 git 操作，agent 就不再只是生成文本，而是在宿主环境中执行真实动作。

如果工具只是 registry 里的函数映射，权限、并发、错误、超时、结果截断、artifact、审计和插件 hook 很快会散落到各个工具实现里。这样会让 core 失去对危险动作的最终控制，也会让后续 context policy、session replay、host adapters 和 enterprise policy 无法从统一事件事实源重建工具行为。

参考项目给出两类互补经验：pi 证明了 extension 可以注册/覆盖工具、拦截 tool call、改写 tool result，从而让工作台高度可编程；deepagentsjs 证明了文件和 shell 能力可以通过 backend/sandbox 与 HITL interrupt 组合，而不是让工具直接绑定某一种本地执行环境。Guga 需要吸收这两点，但不能照搬 pi 的“权限弹窗交给 extension 自己实现”：M3 必须让 core 拥有权限 runtime 和执行管线。

---

## Actors

- A1. 宿主应用开发者：在项目、CLI、server 或测试环境中启用工具插件，并配置工作区、权限默认值和可用工具集合。
- A2. 插件作者：通过插件贡献工具定义、执行逻辑、renderer metadata、prompt 辅助信息和工具相关 hooks。
- A3. Guga core runtime：接收模型产生的 tool intent，执行统一工具管线，并发出可观察 runtime/audit 事件。
- A4. Permission resolver：根据工具 effect、权限规则、session 决策和用户/宿主响应，返回 allow、ask 或 deny。
- A5. 模型 provider bridge：把模型输出的 tool intent 交还给 Guga runtime，不直接执行工具。
- A6. 规划 / 实施 agent：基于本文档规划 M3，不再重新决定工具权限边界、first-party 工具范围或 M3 非目标。

---

## Key Flows

- F1. 插件贡献工具能力
  - **Trigger:** 宿主创建 runtime 并启用 first-party 或自定义工具插件。
  - **Actors:** A1, A2, A3
  - **Steps:** 插件声明工具能力；runtime 收集工具定义；core 将可用工具投影给模型；debug/audit 能解释工具来源、effect、permission 默认值和启用状态。
  - **Outcome:** 不改 core 代码即可新增或替换工具，但工具能力必须通过统一 registry 与权限元数据进入 runtime。
  - **Covered by:** R1, R2, R3, R4, R5

- F2. 模型提出工具调用并进入执行管线
  - **Trigger:** 模型响应中包含一个或多个 tool intent。
  - **Actors:** A3, A4, A5
  - **Steps:** Runtime 查找工具定义；校验和归一化参数；运行 pre-tool hooks；执行权限决策；按并发策略排队；执行工具；运行 post-tool hooks；把结果作为 structured tool result 回流给模型。
  - **Outcome:** 模型不能绕过 Guga 的 tool registry、HookKernel、PermissionKernel 或 execution audit。
  - **Covered by:** R6, R7, R8, R9, R10, R11, R12, R13, R14

- F3. 敏感工具请求用户或宿主授权
  - **Trigger:** 工具 effect、权限规则或 hook gate 要求 ask。
  - **Actors:** A1, A3, A4
  - **Steps:** Runtime 创建 permission request；宿主或用户返回 allow once、deny once、always allow 或 always deny；runtime 记录决策并继续执行或把拒绝结果回流给模型。
  - **Outcome:** 敏感动作在执行前可被阻断，重复请求可以在 session 级缓存，拒绝也成为模型可理解的 tool result。
  - **Covered by:** R15, R16, R17, R18, R19, R20

- F4. 多个工具调用安全调度
  - **Trigger:** 单轮模型响应包含多个 tool intent。
  - **Actors:** A3, A4
  - **Steps:** Runtime 根据工具 effect、并发声明和资源作用域判断可并行批次；只读或互不冲突的工具可并行；未知、交互式或重叠写路径降级串行。
  - **Outcome:** M3 能利用安全并发提高吞吐，但不会并行写同一路径或在不确定场景冒险执行。
  - **Covered by:** R21, R22, R23, R24

- F5. 工具失败、超时或 hook 失败
  - **Trigger:** 工具被拒绝、取消、超时、抛错，或相关 hook 执行失败。
  - **Actors:** A2, A3, A4
  - **Steps:** Runtime 归一化失败；保留原始工具错误语义；post-tool hook 失败只能追加 annotation；最终结果以结构化 tool result 和 runtime event 暴露。
  - **Outcome:** Agent loop 不因普通工具失败崩溃，模型可以根据失败结果调整策略，审计视图能解释真实失败来源。
  - **Covered by:** R25, R26, R27, R28, R29

---

## Requirements

**Tool contract and registry**

- R1. M3 必须定义 core-owned tool runtime contract，作为 core、provider bridge 与工具插件之间的唯一稳定边界。
- R2. Tool definition 必须表达工具名称、描述、参数 schema、effect、安全/权限需求、执行模式、结果预算和 renderer metadata 所需的最小信息。
- R3. 工具插件必须能向 runtime 注册工具能力；注册后的工具必须进入统一工具 registry，而不是让 agent loop 为不同工具来源写分支。
- R4. Runtime 必须能解释每个可用工具的来源、启用状态、权限默认值和 effect，让 debug/audit 能区分 builtin、plugin 和 host-injected 工具。
- R5. 同名工具覆盖必须是显式行为；M3 不得允许外部工具静默覆盖 first-party 工具。

**Execution pipeline**

- R6. M3 必须实现统一 ExecutionPipeline，覆盖 tool lookup、schema validate、arg prepare、pre-tool hooks、permission、timeout、abort、execute、normalize、post-tool hooks、result return 和 audit。
- R7. Provider bridge 只能把模型 tool intent 交回 Guga runtime；不得在 provider bridge 内直接执行工具。
- R8. `tool.call.before` 必须能观察工具调用并返回受控 patch 或 block decision。
- R9. `tool.execute.before` 必须作为真实执行前的最后 gate，能阻断危险动作并留下可审计 decision。
- R10. `tool.execute.after` 与 `tool.result.before` 可以追加 annotation、截断、引用 artifact 或调整模型可见结果，但不得吞掉真实工具错误。
- R11. 所有 mutating、blocking 或 permission-relevant hook decision 都必须进入 runtime/audit 事件。
- R12. Hook 执行必须有确定顺序、timeout、abort 和错误隔离；危险 phase 在不确定时必须 fail closed。
- R13. 工具参数校验失败必须产生结构化 tool result，而不是让 agent loop 以未处理异常终止。
- R14. 工具结果必须保留模型可见内容与 runtime/audit metadata 的边界，避免把审计内部细节误塞进模型上下文。

**Permission runtime**

- R15. M3 必须实现 allow、ask、deny 三态权限协议。
- R16. 权限判断必须发生在真实工具执行之前，且所有副作用工具都必须经过 PermissionKernel。
- R17. Ask 权限请求必须能表达工具名、effect、目标资源或命令摘要、触发 session/run/message/tool call 关系，以及足够宿主渲染确认界面的 metadata。
- R18. Ask 响应必须至少支持本次允许、本次拒绝、session 级 always allow 和 session 级 always reject。
- R19. 拒绝、取消或超时的 permission request 必须回流为结构化 tool result，让模型知道动作未执行并可选择替代方案。
- R20. 插件可以参与 permission ask 或 gate 决策，但最终执行权和决策落账属于 core PermissionKernel。

**Concurrency and resource safety**

- R21. 工具必须默认不可并发，除非其定义或 runtime policy 明确证明该调用安全。
- R22. M3 必须支持至少三类并发策略：可并行只读、必须串行、路径/资源作用域受限。
- R23. 文件写入、编辑和其他 path-scoped mutating 工具不得在路径重叠时并行执行。
- R24. 当 runtime 无法解析工具资源作用域、权限 effect 或并发安全性时，必须降级为串行或 deny/ask，而不是乐观并行。

**First-party tools**

- R25. M3 必须交付 first-party filesystem 工具，覆盖读取、写入、编辑、搜索和目录/文件发现的核心 coding-agent 工作流。
- R26. Filesystem 工具必须受 workspace/root containment 约束，防止路径穿越和越权访问声明工作区之外的文件。
- R27. M3 必须交付 shell execution 工具；shell 默认属于需要 ask 的敏感工具，除非宿主显式配置更宽松策略。
- R28. M3 必须交付 git 辅助工具，至少覆盖状态查看、diff 查看和 commit 辅助；危险或历史改写类 git 操作不属于 M3 默认能力。
- R29. First-party 工具失败、被拒绝、被取消、超时或输出过大时，必须以结构化结果和 runtime 事件暴露。

**Result handling and observability**

- R30. 工具输出必须有 result budget；超过预算的输出不得不受控地完整进入模型输入。
- R31. 大结果可以被截断、摘要化或转成 artifact/reference，但模型可见结果必须清楚表达发生了截断或外部引用。
- R32. 每次工具调用必须产生可观察生命周期事件，至少覆盖 queued、permission requested、started、progress/partial update、completed、failed、denied、cancelled 或 timed out 中适用的状态。
- R33. 工具执行事件必须足以让后续 session replay、audit projection 和 context policy 重建“发生了什么”，即使 M3 不实现完整 replay。
- R34. Tool renderer metadata 必须足以让未来 host adapter 表达 read/edit/search/execute/git 等工具类别，但 M3 不要求实现具体 UI。

**Mature library adoption**

- R35. First-party filesystem、git 和 shell 插件可以引入成熟 npm 包来承担通用底层能力，但这些依赖必须停留在插件包内，不得进入 `packages/core` 的 public/runtime dependency boundary。
- R36. Filesystem 工具应优先复用成熟库处理 glob、ignore 规则、文本 diff 或等价通用能力，避免自研递归搜索、glob 匹配和 diff 生成这类高踩坑基础设施。
- R37. Git 工具应优先复用成熟 git wrapper 或 diff parser 来实现受控 backend 能力，但不得因此暴露任意 git command 通道；runtime 仍只暴露经过权限和 scope 设计的安全工具。
- R38. Shell 工具可以复用成熟 process execution / spawn / output cleanup 辅助库，但权限、timeout、AbortSignal、进程清理、输出预算和 lifecycle events 仍由 Guga runtime/tool backend 明确控制。
- R39. 引入第三方库时必须保留可替换 backend 边界；宿主后续应能替换成本地、sandbox 或远端 backend，而不需要修改 core contract 或 agent loop。

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4, R6.** Given 宿主启用了一个自定义工具插件，当 runtime 初始化并执行一次包含该工具的 run，工具通过统一 registry 被发现、进入模型工具池，并通过统一 ExecutionPipeline 执行。
- AE2. **Covers R7, R15, R16, R20.** Given 模型通过 provider bridge 输出 shell tool intent，当该命令需要 ask 权限时，provider bridge 不执行命令，runtime 创建 permission request，并在用户允许后才执行。
- AE3. **Covers R8, R9, R11, R12.** Given 插件注册了 pre-tool gate hook，当模型提出被该 hook 阻断的工具调用时，工具不会执行，block decision 和原因进入 audit/runtime 事件。
- AE4. **Covers R10, R25, R29, R31.** Given 文件读取工具返回超出预算的大结果，当 post-tool hook 或 result policy 截断模型可见内容时，真实工具成功状态不被吞掉，模型能看到截断提示，runtime metadata 保留完整处理状态。
- AE5. **Covers R18, R19.** Given 用户对某个 shell 命令选择 always reject，当模型在同一 session 再次请求同类命令时，runtime 不重复询问，直接返回结构化拒绝结果。
- AE6. **Covers R21, R22, R23, R24.** Given 同一轮模型请求并行编辑两个重叠路径，当 runtime 解析出路径冲突时，这些写操作不会并发执行。
- AE7. **Covers R26, R27, R28.** Given filesystem、shell 和 git first-party 工具可用，当模型尝试访问工作区外文件、执行 shell 命令或查看 git diff 时，runtime 分别执行 root containment、ask 权限和只读 git 操作边界。
- AE8. **Covers R30, R32, R33, R34.** Given 一个工具从 queued 到 completed 并产生 partial updates，当 host 或测试读取 runtime events 时，能重建工具生命周期、权限状态、结果预算处理和工具类别。
- AE9. **Covers R35, R36, R37, R38, R39.** Given first-party filesystem、git 或 shell 插件引入成熟 npm 包，当工具通过 runtime 执行时，依赖只作为插件 backend 的实现细节存在，模型仍只能看到 Guga 定义的工具 schema、权限边界、结果预算和 lifecycle events。

---

## Success Criteria

- Guga 可以安全执行真实 filesystem、shell 和 git 辅助动作，而不让模型或 provider bridge 绕过 runtime 权限边界。
- 宿主应用开发者可以配置工具集合与权限默认值，并从事件中解释每个工具动作为何被允许、询问、拒绝或失败。
- 插件作者可以贡献工具和工具 hooks，而不需要修改 core agent loop。
- M3 输出的工具结果、权限决策和 hook decision 足够结构化，能支撑 M4 context policy 和 M5 session replay 继续演进。
- First-party 工具实现可以复用成熟 npm 生态降低基础设施风险，同时保持 `packages/core` 小核心、权限执行权和 backend 可替换性。
- `ce-plan` 可以从本文档进入实现规划，不需要重新决定 M3 是否做 browser/MCP/remote sandbox/enterprise policy 或是否把权限外包给插件。

---

## Scope Boundaries

- M3 不实现 browser tools。
- M3 不实现 MCP tool integration；MCP 工具进入统一 registry 的问题留到后续 skills/MCP 里程碑。
- M3 不实现远端 sandbox provider、sandbox marketplace 或完整执行环境供应商体系。
- M3 不实现企业级 policy engine、插件签名、trust tier、allowlist 或 marketplace governance。
- M3 不实现完整 context compaction、长期 tool result store 或跨 session semantic memory。
- M3 不实现 host adapter 的具体 permission dialog UI，只定义 runtime 协议和事件所需信息。
- M3 不实现 multi-agent delegation。
- M3 不实现危险 git 历史改写、远端 push、credential 管理或复杂 git workflow 自动化。
- M3 不把 filesystem、git 或 shell 的第三方依赖引入 `packages/core`；这些依赖只能属于 first-party tool plugin packages 或后续 host-provided backend。
- M3 不实现完整 PTY / interactive terminal session；shell execution 仍是受控命令执行能力，而不是长期终端仿真。
- M3 不要求 first-party 工具覆盖所有 coding-agent 能力；目标是证明安全执行真实动作的最小闭环。

---

## Key Decisions

- Core 拥有 ExecutionPipeline 和 PermissionKernel：Guga 需要比 pi 更强的内建安全边界，不能把危险动作确认完全外包给 extension。
- Tool plugin 贡献能力，core 执行工具管线：这保留 pi 式 extension 灵活性，同时避免 agent loop 为每个工具来源写特例。
- 采用 allow / ask / deny 权限协议：这是 Claude Code、OpenCode 等工具型 agent 的共同收敛，也适合 Guga 的 runtime 审计目标。
- 支持 session 级 always allow / always reject：借鉴 OpenCode 与 deepagentsjs 的确认缓存，降低重复确认成本。
- 文件和 shell 工具抽象出可替换 backend 边界：借鉴 deepagentsjs 的 Backend/Sandbox 思路，但 M3 只要求本地/工作区边界可替换，不做远端 sandbox provider。
- 并发默认保守：借鉴 Hermes 的路径作用域安全判断，不确定时串行或询问，避免并行写路径竞态。
- 工具失败回流给模型：拒绝、超时、取消和异常都应成为 structured tool result，让模型能调整策略，而不是终止整个 agent loop。
- Post-tool hooks 不能吞掉真实错误：插件可以增强、截断、标注结果，但真实工具状态必须对 audit 和模型可解释。
- 成熟 npm 包优先用于插件 backend 的通用基础设施：filesystem 可借助 glob/ignore/diff 生态，git 可借助受控 git wrapper，shell 可借助 process execution/output cleanup 生态；这些库降低实现风险，但不能替代 Guga 的权限、审计、调度和结果预算边界。
- 不采用“任意 shell/git wrapper 等于工具能力”的形态：第三方库只提供受控 backend 原语，Guga 对模型暴露的仍是明确命名、明确 effect、明确权限和明确资源 scope 的工具。

---

## Dependencies / Assumptions

- M3 假设 M1 已经提供可用的 plugin host、capability registry、HookKernel 和最小 tool hook surface。
- M3 假设 M2 provider bridge 会把 tool intent 交给 Guga runtime，而不是自动执行工具。
- M3 假设 core 已有或即将稳定基本 message、tool intent、tool result、event bus 和 agent loop contract。
- M3 假设 first-party filesystem 工具可以在声明工作区内运行；跨工作区、多 workspace 和远端 sandbox 后置。
- M3 假设 first-party tool packages 可以接受少量成熟 npm 依赖，但 `packages/core` 继续不依赖真实 filesystem、git、shell 或 provider SDK 生态。
- M3 假设宿主或测试 harness 能模拟 ask 权限响应；具体 CLI/Web/IDE UI 留到 host adapters。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R6][Technical] Tool definition 的最小字段如何贴合当前 core contract，同时不泄漏具体 host UI 设计？
- [Affects R15, R18][Technical] Permission rule 的最小配置形态是什么，才能覆盖 M3 验收而不提前进入企业 policy engine？
- [Affects R21, R22, R23][Technical] 路径/资源作用域如何从不同工具参数中可靠提取，并在无法提取时统一降级？
- [Affects R25, R26][Technical] Filesystem 工具的 root containment 如何处理 symlink、相对路径、隐藏文件和平台差异？
- [Affects R27][Technical] Shell 工具在 M3 是否需要命令摘要、环境变量过滤或工作目录限制的第一版策略？
- [Affects R30, R31][Technical] 大工具结果在 M3 中只做截断，还是同时引入最小 artifact/reference 机制以服务 M4？
- [Affects R32, R33][Technical] Tool lifecycle events 的精确事件名和 payload 粒度如何与 M1/M2 事件保持一致？
- [Affects R35, R36][Technical] Filesystem 插件应采用哪些成熟库组合来覆盖 glob、ignore、grep/search 和 diff，同时避免把 workspace containment 外包给库默认行为？
- [Affects R35, R37][Technical] Git 插件应选择受控 git CLI wrapper、纯 JS git 实现，还是继续使用薄 `git` subprocess backend；选择标准应同时考虑安全边界、可测试性、安装体积和宿主环境假设。
- [Affects R35, R38][Technical] Shell 插件应采用 process execution helper、轻量 spawn wrapper，还是保留 Node child_process 并只补进程树清理/output cleanup；不得因为引包削弱 AbortSignal、权限和事件控制。

---

## 参考依据

- `docs/roadmap.md`：`Fact`，定义 M3 的目标、范围、first-party 工具、退出标准与跨阶段依赖。
- `docs/brainstorms/2026-05-26-m1-plugin-host-hook-kernel-requirements.md`：`Fact`，M3 依赖 M1 的 plugin host、registry 和 hook kernel。
- `docs/brainstorms/2026-05-26-m2-provider-ai-sdk-bridge-requirements.md`：`Fact`，M3 依赖 M2 的 provider bridge 不直接执行工具。
- `docs/research/context-packs/tool-registry.md`：`Fact`，总结 Claude Code、Hermes、OpenCode、DeerFlow 的工具注册、权限、并发、hook 与结果处理模式。
- `docs/research/context-packs/agent-loop.md`：`Fact`，总结工具执行调度、路径冲突检测、失败回流和消息配对对 agent loop 的影响。
- pi focused context：`Fact`，说明 pi extension 可注册工具、拦截 `tool_call`、改写 `tool_result`，但默认不内置 permission popup。
- deepagentsjs focused context：`Fact`，说明 deepagentsjs 通过 backend/sandbox、filesystem middleware、`interruptOn` 和 session permission decisions 支撑工具执行与 HITL。
- npm package metadata：`Fact`，`fast-glob`、`ignore`、`diff`、`simple-git`、`execa`、`nano-spawn`、`tree-kill`、`strip-ansi` 等成熟包覆盖 filesystem 搜索、git wrapper、process execution 和输出清洗等通用能力；是否采用属于规划阶段的依赖取舍。
- 本文综合判断：`Inference`，Guga 应吸收 pi 的插件灵活性和 deepagentsjs 的 backend/HITL 边界，但在 M3 中让 core 拥有执行管线与权限 runtime。
