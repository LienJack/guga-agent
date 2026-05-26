# Agent Prompt 工程：从最小可运行一路演进到商业级复刻

这里不讲“怎么写一段更长的 system prompt”，而讲一条更实用的路：先做一个能跑的最小版本，再把它逐层演进成可审计、可覆盖、可同步、可投影、可平台化的 prompt 系统。

我把这条路拆成六级：L0 单段 system prompt，L1 四层 PromptBuilder，L2 项目规则 / 用户记忆 / 覆盖策略，L3 工具 / 技能 / middleware 同步，L4 prompt parts 与模型输入投影，L5 商业级 prompt 平台。每一级都不是“优化一点点”，而是在补一个新的系统能力边界。

## Guga 的取舍校准：PromptBuilder 要早，Prompt 平台要晚

Prompt 工程最容易走成“先写一大段系统提示词”。Guga 更稳的路线是：P0 就把 PromptBuilder 做成分层纯函数，但 L5 的版本平台、实验系统和灰度能力延后。这样 prompt 能跟 ToolRegistry、SkillRegistry、ContextState 同步，而不是变成另一个不可审计的全局字符串。

- **P0 先做 base/environment/tools/context 四层**：每层记录 source 和长度，避免后续无法解释模型到底看到了什么。
- **P1 接入项目规则和 skills metadata**：项目规则要有来源、hash 和优先级；skill 只注入 metadata，不把正文常驻 system prompt。
- **P1/P2 再做 Prompt Parts**：文件、reference、compact、artifact、subtask 应作为结构化 part 投影，不要硬拼进一个大字符串。
- **L5 平台能力等真实回归需求出现再做**：prompt version、diff、experiment、budget policy 都很有价值，但要建立在可审计 source list 之上。

证据强度：PromptBuilder 分层、tools/skills 同步、prompt parts 投影是多项目 `Fact`；Guga P0 做分层 builder 是 `Inference`；prompt budget 阈值、版本策略、灰度粒度是 `Pending Verification`。

## 参考项目总览

| 项目 | 最值得学的东西 | 真实路径 |
| --- | --- | --- |
| `blade-agent-sdk` | 最小可维护的 prompt builder 起点 | `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/prompts/builder.ts` |
| `blade-code` | 产品级默认提示、项目规则、Auto Memory、`ConversationState` | `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/prompts/builder.ts` |
| `deepagentsjs` | prompt 与 middleware 同步演进，subagent / filesystem / summarization / skills | `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/agent.ts` |
| `deer-flow` | 动态技能与 subagent 描述，runtime config 驱动 prompt 装配 | `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/prompt.py`、`/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py` |
| `hermes-agent` | prompt 安全扫描、memory/skills/session search 指导语、系统 prompt 分层与缓存稳定性 | `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/prompt_builder.py`、`/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/run_agent.py` |
| `opencode` | prompt parts、reference/file/agent/subtask 投影到 session 协议 | `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/prompt.ts`、`/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/message-v2.ts` |
| `pi agent` | ResourceLoader、prompt templates、`before_agent_start` per-turn prompt 修改、`systemPromptOptions` | `/Users/lienli/Documents/GitHub/guga-agent/docs/research/repomix/pi-focused-context.xml` |

证据锚点建议优先看这些位置：

- `blade-agent-sdk/src/prompts/builder.ts`
- `blade-code/packages/cli/src/prompts/builder.ts`
- `blade-code/packages/cli/src/agent/loop/ConversationState.ts`
- `deepagentsjs/libs/deepagents/src/agent.ts`
- `deer-flow/backend/packages/harness/deerflow/agents/lead_agent/prompt.py`
- `deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py`
- `hermes-agent/agent/prompt_builder.py:32-71`
- `hermes-agent/agent/prompt_builder.py:134-254`
- `pi-focused-context.xml:32541-32576`
- `pi-focused-context.xml:38120-38130`
- `hermes-agent/agent/prompt_builder.py:1289-1422`
- `hermes-agent/run_agent.py:5730-5945`
- `opencode/packages/opencode/src/session/prompt.ts:99-162`
- `opencode/packages/opencode/src/session/prompt.ts:1158-1180`
- `opencode/packages/opencode/src/session/prompt.ts:1503-1579`
- `opencode/packages/opencode/src/session/message-v2.ts:699-860`

## L0：单段 System Prompt

这一步只做一件事：先让 agent 有身份、有边界、能回应。

要做什么：

- 写一段 `BASE_SYSTEM_PROMPT`。
- 说明角色、能力、语气、输出底线。
- 加一条硬规则：不能声称做过没做过的工具调用。
- 只支持文本对话，不引入复杂状态。

参考哪个项目 / 源码：

- `blade-agent-sdk/src/prompts/builder.ts` 里的最小 builder 思路。
- `deepagentsjs/libs/deepagents/src/agent.ts` 顶部 `BASE_AGENT_PROMPT`，它已经把行为底线写得很紧凑。

验收标准：

- 单轮对话可用。
- prompt 可以被人完整读完。
- 没有环境、项目规则、记忆、技能、工具注册表。

不要提前做：

- 不要把未来所有规则一次性塞满。
- 不要假装已经有权限系统、文件系统、工具调用或会话压缩。

## L1：四层 PromptBuilder

这一层开始像工程了，不再是“拼字符串”，而是“装配输入”。

要做什么：

- 把 prompt 拆成四层：
  - `base`：身份、核心行为、输出契约。
  - `environment`：cwd、时间、平台、语言偏好。
  - `tools`：从 registry 生成工具说明。
  - `context`：当前任务摘要、最近状态、必要事实。
- 实现纯函数 `buildSystemPrompt(input): { prompt, sources }`。
- 每层记录 `source`、`loaded`、`length`，以后才能调试和 diff。

参考哪个项目 / 源码：

- `blade-agent-sdk/src/prompts/builder.ts`
- `blade-code/packages/cli/src/prompts/builder.ts`

这里最关键的不是“有没有 builder”，而是它们都已经在做一件相同的事：把 prompt 变成可组合的层，而不是单个常量。

验收标准：

- 同一输入生成同一 prompt。
- 启用或禁用某个工具时，prompt 中对应说明跟着变化。
- 返回结果里能看到来源列表。

不要提前做：

- 不要让 PromptBuilder 调模型。
- 不要让 PromptBuilder 改写 conversation history。
- 不要把规则写死到一个超级长的默认 prompt 里。

## L2：项目规则、用户记忆与覆盖策略

到这一步，prompt 才开始真正“认识项目”和“认识用户”。

要做什么：

- 支持项目规则文件，例如 `AGENTS.md`、`BLADE.md`、自定义规则文件。
- 支持用户级和工作区级 memory。
- 定义覆盖顺序，至少明确谁能覆盖谁，谁只能追加不能覆盖。
- 对每个来源记录文件路径、加载状态、hash 或版本信息。
- 允许替换默认 prompt，但不能把安全规则一起替掉。

参考哪个项目 / 源码：

- `blade-code/packages/cli/src/prompts/builder.ts`
- `blade-code/packages/cli/src/agent/loop/ConversationState.ts`
- `blade-agent-sdk/src/prompts/builder.ts`

`blade-code` 的价值在于它把默认 prompt、`BLADE.md`、Auto Memory、环境上下文、append 这些来源分清了，并且明确 `replaceDefault` 只替换默认层，不吞掉项目文件。

`hermes-agent` 在这一层补了一个常被忽略的商业安全点：项目规则文件本身可能带 prompt injection。它在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/prompt_builder.py:32` 开始定义 context file scanning，发现可疑内容时返回 blocked message，而不是继续加载；相关规则覆盖 `AGENTS.md`、`.cursorrules`、`.hermes.md`、`SOUL.md` 等上下文文件，加载入口集中在 `prompt_builder.py:1289` 到 `:1422`。这给 L2 一个清晰要求：项目规则不是“读到就信”，而是“读到、标记来源、检查风险、再按优先级注入”。

验收标准：

- 改了项目规则文件后，新一轮 prompt 能反映变化。
- prompt source 列表能指出规则来自哪个文件。
- 高优先级安全规则不会被用户 append 覆盖。

不要提前做：

- 不要把项目规则压成普通历史消息。
- 不要无上限加载整个仓库文档。
- 不要把 memory 和项目规则混成一个不可追踪的大块文本。

## L3：工具、技能与 Middleware 同步

这一层解决一个很现实的问题：prompt 说自己能做什么，runtime 就必须真的能做什么。

要做什么：

- 工具说明从 `ToolRegistry` 或等价注册表自动生成。
- 工具的 effect、限制、可见性跟 prompt 一起更新。
- skills 作为数据源加载，可缓存、可刷新、可按 agent 配置过滤。
- middleware 启用时，prompt 里的规则也要跟着同步出现，比如 filesystem、subagent、summarization、patch。

参考哪个项目 / 源码：

- `deepagentsjs/libs/deepagents/src/agent.ts:228-380`
- `deer-flow/backend/packages/harness/deerflow/agents/lead_agent/prompt.py`
- `deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py`

这里最值得抄的不是某一段文案，而是同步方式：

- `deepagentsjs` 在创建 agent 时，把 filesystem、subagent、summarization、patch、skills 作为一组有序 middleware 装进去，prompt 和 runtime 是同一套能力面。
- `deer-flow` 用 `_build_available_subagents_description` 和 `_build_skill_evolution_section` 把能力说明拆成函数，说明 prompt 不该是一整坨模板，而应是按 runtime 状态拼出来的。
- `hermes-agent` 把 memory、session search、skills、kanban、tool enforcement 都做成明确 guidance block：`MEMORY_GUIDANCE` 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/prompt_builder.py:150`，`SESSION_SEARCH_GUIDANCE` 在 `:173`，`SKILLS_GUIDANCE` 在 `:179`，`TOOL_USE_ENFORCEMENT_GUIDANCE` 在 `:254`。这说明商业级 prompt 不是只写“你可以使用工具”，而是让长期记忆、跨会话检索、技能加载和工具强制规则成为可开关的 prompt 层。
- `pi agent` 把 prompt customization 暴露为 extension lifecycle：`before_agent_start` 可以在每轮 agent 开始前检查 raw prompt、images、当前 system prompt 和 `systemPromptOptions`，并允许后续 handler 链式修改，证据在 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/repomix/pi-focused-context.xml:32541` 到 `:32576`。它还允许通过 `DefaultResourceLoader` 覆盖 system prompt、加载 prompt templates 和 context files，见同文件 `:38120` 到 `:38130`。这给 Guga 一个关键边界：PromptBuilder 应是 core 的纯装配器，但 prompt 来源和 per-turn modifier 可以由插件贡献，并且必须记录 source。

验收标准：

- 禁用某工具后，prompt 不再描述它。
- 启用 filesystem middleware 后，prompt 里出现对应行为规则。
- skills 列表能按 app / tenant / agent 过滤。
- prompt 描述的权限不高于 runtime 真正执行的权限。

不要提前做：

- 不要让 prompt 变成权限系统。
- 不要一开始就堆很多子 agent。
- 不要把技能说明手写死在模板里，后续又让 middleware 去做另一套逻辑。

## L4：Prompt Parts 与模型输入投影

这一级开始，prompt 不是“一个字符串”，而是“结构化输入图”。

要做什么：

- 定义 `PromptPart`，至少覆盖 `text`、`file`、`reference`、`tool`、`compaction`、`subtask`、`agent`。
- 让 session 层先保存结构化 parts，再根据 provider 能力投影成最终模型输入。
- 支持 file/reference 转成 synthetic message。
- 支持 compaction 回放和子任务痕迹。
- 对不同模型能力做 fallback，而不是强行把所有东西塞成同一种消息格式。

参考哪个项目 / 源码：

- `opencode/packages/opencode/src/session/prompt.ts:99-162`
- `opencode/packages/opencode/src/session/prompt.ts:1158-1180`
- `opencode/packages/opencode/src/session/prompt.ts:1503-1579`
- `opencode/packages/opencode/src/session/message-v2.ts:699-860`

这组代码最重要的信号是：它已经把 prompt 视作 session 协议的一部分，而不是临时字符串拼接。

验收标准：

- 同一会话可以投影到不同 provider。
- 不支持某种媒体的模型，不会收到它不能理解的输入。
- compaction 后的内容有明确 part 类型，不混进普通用户消息。
- reference、file、agent、subtask 都能在 session 里追踪。

不要提前做：

- 不要让 provider SDK 的 message 类型穿透整个系统。
- 不要把文件内容硬拼进一个超大 prompt 后丢失来源。
- 不要把“历史压缩”做成静默文本截断。

## L5：商业级 Prompt 平台

到这一步，prompt 已经不是代码里的一个函数，而是一个产品能力。

要做什么：

- prompt 版本化：每次改 base prompt 都有版本和变更记录。
- prompt diff：能比较两轮 prompt 的内容和来源差异。
- prompt audit：保存最终发送给模型的消息投影。
- prompt experiment：按 agent / model / tenant 做灰度。
- prompt budget：每层独立预算，超额时按层级降级。
- prompt policy：安全规则不可覆盖，项目规则可追加，用户偏好有边界。

参考哪个项目 / 源码：

- `blade-code/packages/cli/src/prompts/builder.ts`
- `deepagentsjs/libs/deepagents/src/agent.ts`
- `hermes-agent/agent/prompt_builder.py`
- `hermes-agent/run_agent.py:5730-5945`
- `opencode/packages/opencode/src/session/prompt.ts`

这一级的目标不是“更聪明的 prompt”，而是“更可控的 prompt 系统”。

`hermes-agent` 给 L5 的补充是“prompt 平台要服务运行时缓存和多入口复用”。它在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/run_agent.py:5730` 的 `_build_system_prompt_parts()` 先产出系统 prompt 各组成部分，再在 `run_agent.py:5945` 的 `_build_system_prompt()` 合并；`agent/prompt_builder.py` 则保持相对 stateless 的装配函数。这样的边界让 CLI、gateway、ACP、session continuation 能复用同一套 prompt 来源，同时降低把临时上下文塞进 system prompt、破坏 provider prompt cache 前缀稳定性的风险。

验收标准：

- 线上问题能定位到具体 prompt 版本和来源。
- 切换模型时可以重放同一任务做对照。
- 超预算时按层级降级，而不是随机截断。
- 新工具上线时，prompt、schema、权限说明一起更新。

不要提前做：

- 不要先做平台界面，再补底层审计。
- 不要把版本号只写在文档里，不进运行时数据。
- 不要让实验配置直接覆盖安全边界。

## 一条更实际的落地顺序

如果你要从 0 开始复刻，不要反过来做平台。

1. 先做 L0，保证 agent 能稳定说话。
2. 再做 L1，把 prompt 装配拆成四层。
3. 接着做 L2，把项目规则和 memory 分离出来。
4. 然后做 L3，让工具、技能、middleware 同步。
5. 再上 L4，把 session 变成结构化 prompt parts。
6. 最后才做 L5，把版本、审计、灰度、预算做成平台能力。

如果面向 Guga 当前阶段，可以落成：

| 优先级 | 先做什么 | 暂时不做什么 |
| --- | --- | --- |
| P0 | `buildSystemPrompt(input)`、base/environment/tools/context 四层、source list、工具说明来自 registry | prompt 实验平台、复杂 memory、长文档全量注入 |
| P1 | 项目规则加载与风险标记、user/workspace memory 边界、skills metadata、prompt 与 permission/tool visibility 同步 | skill 正文常驻、自动改写历史、不可追踪 append |
| P2 | PromptPart、provider projection、compact/file/reference part、prompt audit/diff、层级预算降级 | 多租户 prompt 平台、灰度实验 UI |

这条顺序的好处很朴素：每一层都能独立验收，而且一旦出问题，你知道该回退哪一层，而不是去一个超长 prompt 里找针。
