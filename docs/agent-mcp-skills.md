# Agent MCP 与 Skill 系统：从外部能力接入到商业级复刻

MCP 和 skill 很容易被混成一件事：都是“给 agent 增加能力”。但从参考项目看，它们解决的是两类完全不同的问题。MCP 解决的是外部能力如何被发现、连接、授权、调用和动态刷新；skill 解决的是任务知识、工作流、脚本、模板和参考资料如何按需进入上下文。前者更像远端工具协议，后者更像可装配的操作手册。

真正商业级的 agent 不能把 MCP 当成“从服务器拉一批 tool schema”，也不能把 skill 当成“把一整篇 Markdown 塞进 system prompt”。`blade-agent-sdk`、`blade-code`、`opencode`、`deepagentsjs`、`deer-flow`、`hermes-agent` 给出的共同答案是：外部能力必须先进入 runtime 的治理边界，再暴露给模型。模型只负责提出使用意图；runtime 负责判断这个能力是否可见、是否可信、是否需要授权、结果如何回流、状态如何恢复。

本文沿用 `docs/agent-react-pattern.md` 的写法：不做目录导览，而是给一条可以复刻的阶段路线图。参考项目版本锚点来自 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/intake/source-contract.md`：`blade-agent-sdk@5d67e5e`、`blade-code@ad67f3d`、`opencode@caf1151`、`deepagentsjs@7c33a86`、`deer-flow@84f88b6`、`cc-haha@dbb8c95`、`hermes-agent@dd0923b`。

## Guga 的取舍校准：MCP 是工具来源，Skill 是渐进知识

MCP/Skill 的路线不能早于 ToolRegistry 和 PromptBuilder。对 Guga 来说，P0 可以先支持本地 MCP stdio 和本地 `SKILL.md`，但它们都必须穿过统一 runtime 边界：MCP tool 进 `ToolRegistry`，skill metadata 进 `PromptBuilder`，正文通过工具按需加载。

- **MCP 不改变 ReAct 协议**：外部工具最终仍然是 `ToolDefinition`，仍然要 obey tool_call/tool_result 配对、权限、结果预算和 audit。
- **Skill 不是系统提示词补丁**：skill 正文优先级低于系统/开发者/项目/用户规则，默认只加载 name/description。
- **权限和信任要早于 marketplace**：MCP server、远端 resource、community skill 都是供应链入口。P1 至少要有 allow/ask/deny、trust level 和静态扫描。
- **动态刷新和 OAuth 是 P2**：长进程治理很重要，但要等 registry、permission、progressive disclosure 稳定后再扩展。

证据强度：progressive disclosure、统一工具池、allow/ask/deny 是多项目 `Fact`；Guga 先做 stdio MCP + local skills 是 `Inference`；OAuth、多传输协议、marketplace 具体范围是 `Pending Verification`。

## 先分清终局：MCP 是工具入口，skill 是知识入口

如果只看模型输入，MCP 工具和内置工具最后都会变成 function declaration；skill 也可能最后表现为一个 `skill_view` 或 `skill` 工具。这个表面相似性很误导。正确的系统边界应该是：

- `McpRegistry`：管理服务器配置、连接状态、工具发现、命名冲突、动态刷新。
- `McpClient`：负责 stdio、HTTP、SSE、OAuth、timeout、资源清理。
- `McpToolAdapter`：把 MCP tool schema 转成 agent 自己的 `ToolDefinition`。
- `ToolRegistry`：统一内置工具、插件工具、MCP 工具的可见性和执行入口。
- `PermissionRuntime`：把远端工具也纳入权限规则，不因为它来自 MCP 就默认可信。
- `SkillRegistry`：扫描 skill 来源，只加载 metadata，不急着加载正文。
- `SkillTool`：模型认为需要某项技能时，再按权限加载完整 `SKILL.md` 和相关文件。
- `SkillSecurity`：扫描 skill 内容、来源、依赖、脚本和隐式 prompt injection。
- `PromptBuilder`：只注入可用 skill 摘要，不把所有 skill 内容一次性塞进 system prompt。

这九个对象不应该第一天一口气写完。更稳的路线是：先证明一个 MCP server 和一个 skill 能闭环，再分别补上 registry、权限、渐进披露、动态刷新、安全扫描和多入口协同。

## 参考项目应该怎么借

`blade-agent-sdk` 是最适合学习最小骨架的项目。它的 `McpRegistry` 是 per-session 实例，负责服务器注册、连接、状态和工具发现，证据是 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/mcp/McpRegistry.ts:23` 到 `:29`；`createMcpTool` 把 MCP tool 转成标准 Blade tool，并把 MCP 外部工具标为 `ToolKind.Execute`，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/mcp/createMcpTool.ts:12` 到 `:49`。skill 侧的 `SkillRegistry` 则明确写了 Progressive Disclosure：启动时加载 metadata，执行时才加载完整内容，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/skills/SkillRegistry.ts:1` 到 `:6`。

`blade-code` 更像 CLI 产品态的中间层。它保留了 MCP 管理命令、MCP tool 热更新、技能目录优先级和 plugin skill 命名空间。`ToolRegistry` 同时管理内置工具和 MCP 工具，MCP 工具可覆盖以支持热更新，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/tools/registry/ToolRegistry.ts:314` 到 `:347`；`SkillRegistry` 先装默认 skill，再扫描 Claude Code 与 Blade 的用户级、项目级目录，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/skills/SkillRegistry.ts:80` 到 `:148`。

`opencode` 代表 session runtime 的成熟做法。它的 MCP service 支持 local stdio 与 remote HTTP/SSE，远端 OAuth 失败会进入 `needs_auth` 或 `needs_client_registration` 状态，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/mcp/index.ts:301` 到 `:415`；session prompt 在解析工具时把内置 registry tools 和 `mcp.tools()` 合并，而且 MCP 工具执行前会走 `ctx.ask`，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/prompt.ts:606` 到 `:690`。skill 侧，`SkillTool` 在加载前请求 `permission: "skill"`，并把 skill 目录下的辅助文件抽样列出，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/skill.ts:23` 到 `:71`。

`deepagentsjs` 的价值不在 MCP，而在 skill 的组合方式。它没有把 skill 当作全局背景噪音，而是让 `skills` 参数进入 middleware 栈；自定义 subagent 默认不继承主 agent 的 skills，只有 general-purpose subagent 继承，见 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/agent.ts:228` 到 `:258`、`:301` 到 `:315`。这给复刻者一个很关键的边界：skill 是能力配置，不是全局空气。

`deer-flow` 更适合学习“skill 与 agent 配置联动”。它在创建 lead agent 时根据 agent config 计算 `available_skills`，再用 skill policy 过滤工具，证据在 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py:367` 到 `:444`；prompt 侧还有 enabled skills cache，避免每次请求都阻塞磁盘扫描，见 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/prompt.py:19` 到 `:127`。

`hermes-agent` 是商业级压力样本。它的 MCP client 不是薄 wrapper，而是长进程治理系统：后台 event loop、stdio/HTTP/SSE、OAuth、动态工具刷新、错误脱敏、stderr 日志重定向都在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/mcp_tool.py:1` 到 `:75` 里写成模块契约；工具列表变化时，它用 `notifications/tools/list_changed` 触发后台刷新，并避免在 SDK handler 内同步刷新导致 JSON-RPC 卡死，见 `mcp_tool.py:995` 到 `:1115`。skill 侧，`skills_guard.py` 对外部 skill 做静态威胁扫描和 trust-level install policy，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/skills_guard.py:1` 到 `:23`、`:39` 到 `:51`。

`cc-haha` 不适合当 MCP 或 skill core 范本，但很适合看远端权限桥接。它会为本地 CLI 不认识的远端工具创建 stub，用来把远端 MCP 类工具的权限请求接回本地 UI，见 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/remotePermissionBridge.ts:48` 到 `:77`。

## L0：先跑通一个 MCP server 和一个 SKILL.md

L0 的目标不是设计生态，而是证明两条闭环成立：

- MCP：配置一个 server，发现一个 tool，模型能调用它，tool result 能回到下一轮模型。
- Skill：扫描一个 `SKILL.md`，模型能看到它的 name/description，需要时能加载完整正文。

要做什么：

- 支持最小 MCP 配置：`name`、`command` 或 `url`、`args`、`env`、`timeout`。
- 连接后调用 `listTools()`，把工具 schema 暂时转成内置 `ToolDefinition`。
- 对 MCP 工具统一加 `external` 或 `execute` effect，不默认只读。
- 支持一个 `skills/<name>/SKILL.md` 目录，解析 YAML frontmatter 的 `name` 和 `description`。
- prompt 里只注入 skill metadata，不注入全文。
- 提供一个 `skill_view(name)` 或 `skill({ name })` 工具，用来加载全文。

参考源码：

- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/mcp/createMcpTool.ts:18` 到 `:49` 展示最小 MCP tool adapter：JSON Schema 转 Zod，设置 tool name/displayName/kind/description。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/skills/SkillLoader.ts:29` 到 `:36` 展示 skill loader 的基本解析边界：frontmatter、name 规则、description 长度、inline command pattern。
- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/skill.txt:1` 说明 skill 工具的最小语义：当任务匹配 system prompt 中列出的 skill 时加载专门 skill。

验收标准：

- MCP server 连接失败时，不影响 agent 启动，只记录 failed status。
- MCP tool 执行失败时，作为结构化 tool result 回到模型，而不是让 loop 崩溃。
- skill metadata 列表能展示名称和描述；加载正文必须由显式工具调用触发。
- 一个 skill 的正文里引用 `references/` 或 `scripts/` 时，runtime 能告诉模型相对路径基准。

不要提前做什么：

- 不要把所有 MCP server 默认设为可信。
- 不要把所有 skill 全文拼进 system prompt。
- 不要先做 skill marketplace。L0 只证明本地 `SKILL.md` 的 progressive disclosure 成立。
- 不要允许 skill 正文里的脚本自动执行。

L0 的完成标志是：系统知道“外部工具”和“任务知识”不是 prompt 文案，而是两条可调用、可失败、可记录的 runtime 通道。

## L1：Registry，一切外部能力先进入统一目录

L1 开始处理声明一致性。MCP 工具、内置工具、插件工具如果走三套 registry，模型迟早会看到不存在的工具、重复名字或错误 schema。skill 也一样，如果用户目录、项目目录、插件目录没有优先级和命名规则，加载到哪一个版本会变成偶然事件。

要做什么：

- 建立 `McpRegistry`：记录 server config、client、status、lastError、tools。
- 建立 `ToolRegistry`：内置工具、MCP 工具、插件工具统一查询，最终只向模型暴露一份工具表。
- 做 MCP tool 命名冲突处理：无冲突用原名，有冲突加 server 前缀。
- 建立 `SkillRegistry`：扫描 user/project/additional sources，并记录 source kind、trustLevel、precedence。
- skill 同名冲突按 source precedence 解决，保留来源路径用于调试。
- skill 只生成 available list，正文继续懒加载。

参考源码：

- `blade-agent-sdk` 的 `McpRegistry.getAvailableToolsByServerNames()` 先统计工具名冲突，再在冲突时用 `${serverName}__${toolName}`，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/mcp/McpRegistry.ts:228` 到 `:259`。
- `blade-agent-sdk` 的 `SessionRuntime.refreshMcpTools()` 先移除指定 server 的 MCP tools，再把新工具注册进 tool catalog，且标注 `kind: 'mcp'`、`trustLevel: 'remote'`，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/session/SessionRuntime.ts:356` 到 `:368`。
- `blade-agent-sdk` 的 `SkillRegistry.resolveSources()` 同时处理 user skills、project skills 和 additional sources，并排序 precedence，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/skills/SkillRegistry.ts:102` 到 `:127`。
- `opencode` 的 skill discovery 同时扫描 `.opencode`、`.claude`、`.agents`、配置路径和 URL 拉取结果，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/skill/index.ts:154` 到 `:206`。

验收标准：

- 同名 MCP 工具不会静默覆盖内置工具。
- 禁用某个 MCP server 后，模型输入里不再出现该 server 的工具。
- skill 的最终版本可解释：来自哪个目录、为什么覆盖另一个同名 skill。
- available skills 列表不超过 metadata 预算，并可按 agent/config 过滤。

不要提前做什么：

- 不要让 MCP tool adapter 绕过主 ToolRegistry 直接塞进模型请求。
- 不要把 skill registry 做成全局不可刷新单例，至少要能在开发期 refresh。
- 不要把 skill 名称解析交给模型猜测；runtime 要负责 exact name 和错误提示。

L1 完成后，系统第一次有了外部能力目录。之后的权限、安全、缓存、UI 都可以围绕同一份目录做治理。

## L2：Progressive Disclosure，让上下文只在需要时变重

MCP 和 skill 最大的共同风险是上下文膨胀。一个 MCP server 可能暴露几十个工具、resources 和 prompts；一个 skill 可能带 `references/`、`templates/`、`scripts/`、`assets/`。如果一启动就全量注入，agent 还没开始工作就已经把上下文预算花光了。

要做什么：

- MCP 第一层只暴露工具 schema；resources/prompts 通过专门 utility tools 查询。
- skill 第一层只暴露 name/description/argument hint。
- skill 正文通过 `skill_view` 加载，linked files 再二次加载。
- 对 MCP result 和 skill content 都做 result budget，超额写入文件或附件。
- PromptBuilder 只注入“当前 agent 可用的 skill 摘要”，不注入全部 skill 内容。

参考源码：

- `blade-agent-sdk` 的 `injectSkillsMetadata()` 只替换 `Skill` 工具描述中的 `<available_skills>` 占位符，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/skills/injectSkillsMetadata.ts:1` 到 `:6`、`:27` 到 `:61`。
- `hermes-agent` 的 `skills_tool.py` 明确把 `skills_list` 定义成 metadata tier，把 `skill_view` 定义成 full content 和 linked files tier，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/skills_tool.py:1` 到 `:13`、`:1456` 到 `:1488`。
- `opencode` 的 `SkillTool` 返回 `<skill_content>`，同时给出 skill base directory 和 sampled file list，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/skill.ts:50` 到 `:71`。
- `opencode` 在 MCP 工具结果里把 text、image、resource 分开处理，并对 text 做 truncation，把图片或 blob 变成 attachments，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/prompt.ts:641` 到 `:683`。

验收标准：

- 有 100 个 skill 时，模型只看到摘要列表，不看到 100 篇正文。
- 加载 skill 后，模型知道 skill 的 base directory 和可用辅助文件。
- MCP 返回图片、resource、blob 时，UI/附件层能保留，模型只拿必要摘要。
- 超大 MCP/tool output 不直接塞爆下一轮模型输入。

不要提前做什么：

- 不要把 skill 写成“永久 system prompt 扩展”。
- 不要把 MCP resources 当普通 text result 全量回填。
- 不要把 linked files 自动全部加载。让 skill 正文先告诉模型下一步该读什么。

L2 的本质是：能力可以很多，但当前回合只应该变重到任务需要的程度。

## L3：权限与信任边界，外部能力不能自证安全

MCP server 和外部 skill 都是供应链入口。MCP 工具描述可能带 prompt injection；skill Markdown 可能藏“忽略之前规则”的指令、读取密钥的脚本、持久化后门或危险 shell。商业级 runtime 不能因为能力是用户配置的，就把它当成可信系统指令。

要做什么：

- MCP 工具默认走 permission runtime，至少按 server/tool name 发起权限请求。
- skill 加载也要走权限请求，尤其是外部来源、URL 拉取、插件来源。
- 给 skill source 标注 trust level：builtin、trusted、community、agent-created。
- 安装外部 skill 前做静态扫描，至少覆盖 prompt injection、secret exfiltration、destructive command、persistence、network tunnel。
- 扫描 MCP tool description，发现疑似 prompt injection 时记录 warning 或阻断。
- 允许 agent/config 禁用某些 skill、MCP server 或 tool glob。

参考源码：

- `opencode` 在 MCP 工具执行前调用 `ctx.ask({ permission: key, patterns: ["*"], always: ["*"] })`，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/prompt.ts:622` 到 `:624`。
- `opencode` 在加载 skill 前也调用 `ctx.ask({ permission: "skill", patterns: [params.name] })`，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/skill.ts:32` 到 `:37`。
- `hermes-agent` 的 `skills_guard.py` 把外部 skill 安装策略写成 trust-level policy：builtin 全放行，trusted 可放行 caution，community 有 finding 就阻断，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/skills_guard.py:39` 到 `:51`。
- `hermes-agent` 的 MCP 注册流程在注册前扫描 tool description，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/mcp_tool.py:2944` 到 `:2948`。
- `cc-haha` 的 remote permission bridge 为本地不认识的远端工具创建 stub，并把 `needsPermissions()` 设为 true，见 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/remotePermissionBridge.ts:48` 到 `:77`。

验收标准：

- MCP server 暴露的写入、执行、外部 API 调用默认需要权限。
- skill 加载权限可以被 session rules 允许、拒绝或 always allow。
- community skill 如果包含读取 `.env`、访问 `~/.ssh`、反向 shell、隐藏 prompt injection，会被扫描拦截。
- 禁用某个 MCP server 或 skill 后，模型看不到也调不到。
- 权限拒绝能作为 observation 回到模型，而不是挂死 loop。

不要提前做什么：

- 不要让 MCP server 的 tool description 直接成为高优先级 instruction。
- 不要把 skill 正文视为系统规则。skill 是任务资料，优先级低于开发者/项目/用户规则。
- 不要把 “Allow always” 默认持久化到全局。session allow 和 persistent allow 是两种产品语义。

L3 完成后，MCP 和 skill 才真正进入安全边界。此前它们只是能用，不代表能放心给用户用。

## L4：动态刷新、OAuth 与长进程治理，让外部能力活得下来

demo 级 MCP 通常只做启动时连接。商业级 MCP 要面对完全不同的问题：server 启动慢、stdio stderr 污染 TUI、远端 OAuth 过期、工具列表变化、server 卡死、进程重启、并发请求抢同一 JSON-RPC 流。skill 也有类似问题：用户安装新 skill、禁用旧 skill、更新 skill 内容、不同 agent 使用不同 skill set，prompt cache 不能被无意义打碎。

要做什么：

- MCP server status 至少区分 connected、disabled、failed、needs_auth、needs_client_registration。
- 支持 local stdio 与 remote HTTP/SSE，连接失败要关闭 transport。
- 支持 OAuth token storage、auth flow、401 recovery 和非交互环境错误。
- 支持 `tools/list_changed` 动态刷新工具表，并广播工具变更事件。
- 长进程 MCP server 要有 stderr 日志、timeout、reconnect、shutdown cleanup。
- skill registry 要能 refresh，并能按 config/agent 缓存 available skills。

参考源码：

- `opencode` 的 MCP status union 包括 `connected / disabled / failed / needs_auth / needs_client_registration`，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/mcp/index.ts:80` 到 `:103`。
- `opencode` 的 `connectTransport()` 用 acquire/use/release 保证连接失败时关闭 transport，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/mcp/index.ts:281` 到 `:297`。
- `opencode` 的 `watch()` 监听 `ToolListChangedNotificationSchema`，刷新 defs 并发布 `ToolsChanged`，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/mcp/index.ts:504` 到 `:515`。
- `hermes-agent` 的 `mcp_tool.py` 把后台 event loop、thread safety、reconnect、timeout、stderr 重定向写进模块契约，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/mcp_tool.py:49` 到 `:75`、`:95` 到 `:164`。
- `hermes-agent` 的 `_refresh_tools()` 用 refresh lock 防止重叠刷新，先移除 stale tools，再重新注册新列表，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/mcp_tool.py:1056` 到 `:1115`。
- `hermes-agent` 的 `MCPOAuthManager` 是进程级 per-server OAuth 状态中心，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/mcp_oauth_manager.py:339` 到 `:359`、`:590` 到 `:599`。
- `deer-flow` 对 enabled skills 做后台 cache warm-up，避免请求路径阻塞磁盘读取，见 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/prompt.py:19` 到 `:127`。

验收标准：

- 远端 MCP 需要 OAuth 时，agent 不报神秘失败，而是进入可诊断状态。
- MCP tools 变化后，新工具可见，旧工具不可调，且工具表变更能通知 UI 或 session。
- MCP stdio server 的 stderr 不会污染 TUI。
- MCP 工具调用 timeout 后，server error 计数和后续 reconnect 策略可解释。
- 安装或删除 skill 后，available skills 能刷新，prompt cache 不被无关变动频繁破坏。

不要提前做什么：

- 不要把 MCP 连接当作一次性启动逻辑。长会话里它一定会断、会变、会过期。
- 不要在 notification handler 里做同步重刷新。`hermes-agent` 已经踩过会卡住 JSON-RPC 流的坑。
- 不要让每个入口自己处理 OAuth。OAuth 状态需要中心化，否则 CLI、gateway、cron、ACP 会各自漂移。

L4 的完成标志是：外部能力不是“刚启动时可用”，而是能在长会话、多入口、动态变更中保持可解释。

## L5：平台化能力面，让 MCP、skill、plugin、agent 配置互相协同

L5 解决的是产品层问题。用户不会只配置一个 MCP server，也不会只安装一个 skill。他们会按 agent、workspace、tenant、mode、profile、任务类型配置能力。此时 MCP 和 skill 不再是两个功能，而是 agent capability surface 的一部分。

要做什么：

- 每个 agent 有自己的 tool groups、MCP allow/deny、skills allow/deny。
- subagent 默认不继承全部能力，除非显式配置或使用 general-purpose 策略。
- skill 可以声明 allowed/disallowed tools，用来约束任务期间的工具面。
- MCP server 可以被 agent 层启用或禁用，支持 glob 规则。
- UI/API/TUI/cron/remote session 都复用同一套 registry 和 permission runtime。
- capability surface 进入审计：某次模型请求到底看到了哪些 MCP tools、skills、permissions。

参考源码：

- `deepagentsjs` 的 custom subagent 默认不继承 main agent skills，只有配置了 `input.skills` 才加 `createSkillsMiddleware`，见 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/agent.ts:228` 到 `:258`。
- `deepagentsjs` 的 general-purpose subagent 显式继承 root `skills` 和 `effectiveTools`，见 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/agent.ts:301` 到 `:310`。
- `deer-flow` 创建 agent 时把 `available_skills`、`tool_groups` 写入 metadata，并用 `filter_tools_by_skill_allowed_tools` 过滤工具，见 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/agents/lead_agent/agent.py:398` 到 `:444`。
- `opencode` 的 ToolRegistry 在工具描述阶段把 SkillTool 描述动态补上 available skills，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/registry.ts:271` 到 `:285`、`:333` 到 `:338`。
- `hermes-agent` 的 tool registry 用锁、generation counter、toolset alias 维持动态工具表的一致性，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/registry.py:151` 到 `:167`、`:208` 到 `:218`。
- `hermes-agent` 的 `skill_view` 在成功加载后 bump view/use 计数，让 curator 可以识别哪些 skill 真正在使用，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/skills_tool.py:1500` 到 `:1522`。

验收标准：

- 不同 agent 看到的 MCP tools 和 skills 可以不同，而且差异可审计。
- subagent 不会意外获得主 agent 的全部外部能力。
- skill 激活后可以收窄工具面，例如只允许读文件、搜索和指定 API。
- UI、cron、remote、CLI 使用同一套权限语义，不出现“CLI 禁止但 cron 可以”的裂缝。
- 每次 run 能记录 capability snapshot：工具、MCP servers、skills、permission rules、source versions。

不要提前做什么：

- 不要把能力配置只做成 prompt 文案。真正的控制必须发生在 tool resolution 和 execution 阶段。
- 不要默认让所有 subagent 继承所有 skills 和 MCP tools。
- 不要把 plugin、MCP、skill 分别做三套 enable/disable 规则。用户最终只关心某个 agent 能做什么。

L5 的目标不是“有更多插件”，而是让外部能力成为可组合、可审计、可收缩的产品表面。

## 一条更实际的落地顺序

如果从 0 到 1 复刻，不要先做 marketplace，也不要先做复杂 OAuth。更稳的顺序是：

1. L0：实现 `McpClient.connect/listTools/callTool` 和 `SkillRegistry.scan/skill_view`。
2. L1：把 MCP tools 和 built-in tools 合并到统一 `ToolRegistry`，把 skills 做成 metadata registry。
3. L2：实现 progressive disclosure，skill 只注入摘要，正文和 linked files 按需加载；MCP result 走 truncation/attachments。
4. L3：把 MCP 和 skill 都纳入 permission runtime，增加 source trust 与静态扫描。
5. L4：补 dynamic refresh、OAuth、server status、stderr logging、reconnect 和 cache invalidation。
6. L5：把能力面提升到 agent/profile/session 层，支持每个 agent 的 MCP/skill/tool policy 和审计快照。

如果按 Guga 当前阶段排序：

| 优先级 | 先做什么 | 暂时不做什么 |
| --- | --- | --- |
| P0 | 本地 stdio MCP `connect/listTools/callTool`、MCP tool adapter、local `SkillRegistry`、`skill_view`、metadata-only prompt 注入 | marketplace、remote OAuth、skill 脚本自动执行 |
| P1 | 统一 ToolRegistry、MCP/skill permission、trust level、skill 静态扫描、result truncation/attachments、agent 可见性过滤 | 动态 plugin 生态、多入口 OAuth 状态中心 |
| P2 | remote HTTP/SSE MCP、OAuth、`tools/list_changed` refresh、registry generation、per-agent capability snapshot、subagent 能力继承策略 | 自进化 skill curator、复杂 marketplace 计量 |

如果团队已经有 ReAct loop 和 ToolRegistry，最小可行的 MCP 接入应该落在 L1，而不是重写 loop。MCP 只是工具来源之一，不应该改变 assistant tool call 与 tool result 的严格配对规则。相反，如果团队还没有稳定 ToolRegistry，先接 MCP 会让系统更乱，因为远端工具的 schema、权限、错误和结果类型都会放大已有的不一致。

Skill 也类似。没有 PromptBuilder 和工具权限时，skill 很容易退化成“用户安装的系统提示词”。正确路线是先把它当 metadata 和 on-demand content 管起来，再逐步允许它携带脚本、模板、setup、allowed tools、usage telemetry。

## 最值得借的设计点

第一个可借设计点是 `MCP tool adapter`。无论底层是 stdio、HTTP 还是 SSE，进入 agent loop 之前都应该转成统一 `ToolDefinition`。`blade-agent-sdk` 的 `createMcpTool` 是最小范本；`opencode` 和 `hermes-agent` 则提醒你，结果不能只返回 text，还要处理 image、resource、blob、timeout 和 metadata。

适用场景：你已经有内置 ToolRegistry 和 ReAct loop。

不适用场景：你还靠 prompt 正则解析 `Action:`，没有结构化 tool call id。此时先补 ReAct loop，再接 MCP。

迁移优先验证：命名冲突、schema 转换失败、MCP error result、权限拒绝、超大结果、图片/资源附件。

第二个可借设计点是 `skill progressive disclosure`。启动时只加载 `name/description`，模型需要时再调用 `skill_view`。这是所有参考项目里最一致的方向：`blade-agent-sdk`、`blade-code`、`opencode`、`hermes-agent` 都没有鼓励全量 skill 注入。

适用场景：你有很多领域工作流、模板、脚本和参考资料，希望 agent 按任务自选。

不适用场景：skill 数量极少且每个只有几行固定规则。此时项目规则文件可能比 skill 系统更简单。

迁移优先验证：metadata 预算、同名覆盖、skill 正文优先级、linked files 加载、安全扫描。

第三个可借设计点是 `capability surface per agent`。`deepagentsjs` 和 `deer-flow` 都说明 skills 不应该天然全局可见。一个代码审查 agent、一个日程 agent、一个研究 agent 应该看到不同工具和不同 skill。

适用场景：你的系统已经有 agent profiles、subagents 或多租户配置。

不适用场景：只有一个单用户本地 agent，且能力面很小。此时过早做 profile policy 会增加配置负担。

迁移优先验证：subagent 是否继承主 agent 能力、Plan 模式是否禁用副作用工具、skill allowed-tools 是否真的影响执行层。

第四个可借设计点是 `dynamic registry generation`。`hermes-agent` 的 generation counter 和 lock 不是形式主义。只要 MCP tools 会动态刷新、plugin 会热加载、skill 会更新，prompt/tool definition cache 就必须知道什么时候失效。

适用场景：长进程 agent、TUI、server mode、cron、gateway、远端 session。

不适用场景：一次性 CLI，每次运行重新加载全部能力。可以先不做 generation cache。

迁移优先验证：工具列表变化时正在执行的 tool call 是否还能完成、旧工具是否被正确下线、新工具是否进入下一轮模型输入。

## 风险与边界

最大风险是把 MCP 当作可信插件。MCP server 运行在你的权限边界内，尤其是 stdio server，通常和 agent 进程共享用户环境变量、文件系统访问和网络能力。`blade-code` 的 SECURITY 文档也明确提醒 MCP server 与 Blade Code 拥有相同权限，应该只安装可信 server。复刻时不能只做“添加 server”命令，还要做信任提示、权限 gating、日志和禁用入口。

第二个风险是把 skill 当成高优先级指令。skill 来自文件、URL、插件或 agent 自己生成的内容，本质上更接近“任务资料”。它可以指导模型怎样完成某类任务，但不能覆盖系统规则、项目规则和当前用户意图。`hermes-agent` 对 skill 做 prompt injection 扫描，就是因为 skill 内容会在运行时进入 prompt，如果不治理，它就是一条供应链注入路径。

第三个风险是能力面漂移。CLI 看到的 MCP tools、TUI 展示的 tools、cron 能用的 tools、远端 session 可审批的 tools 如果不是同一套 registry 投影出来的，用户会遇到最难查的问题：同一个 agent 在不同入口表现不同。`hermes-agent` 和 `opencode` 的复杂性很大一部分都来自多入口协同，这不是第一版必须全做，但架构上要给它留位置。

第四个风险是过早平台化。MCP OAuth 2.1、skill marketplace、usage curator、动态刷新、agent profile policy 都很诱人，但如果 L0-L2 没打稳，它们只会把系统推向不可调试。第一版先保证：看得到、调得通、拒得掉、结果回得来。

## 总结

MCP 和 skill 的共同价值不是“让 agent 能力更多”，而是让外部能力可以被接入、筛选、解释和撤回。MCP 应该先变成受 ToolRegistry 和 PermissionRuntime 管理的远端工具来源；skill 应该先变成受 SkillRegistry 和 PromptBuilder 管理的按需知识来源。两者都不能绕过 runtime 直接进入模型。

如果要给 Guga Agent 设计一条复刻路线，最稳的起点是：用 `blade-agent-sdk` 学最小 registry 和 adapter，用 `opencode` 学 session 级权限、OAuth 状态和结果投影，用 `deepagentsjs` / `deer-flow` 学 skill 与 agent 配置的关系，用 `hermes-agent` 学商业级安全和长进程治理。不要照抄任何一个项目的完整形态；先抽出边界，再按阶段把控制权收回来。
