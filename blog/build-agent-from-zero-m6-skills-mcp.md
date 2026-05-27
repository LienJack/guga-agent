---
title: 从 0 到 1 构建 Agent：M6 Skills、MCP 与能力发现
tags:
  - agent
  - runtime
  - guga
  - m6
  - skills
  - mcp
aliases:
  - M6 Skills MCP
  - Capability Discovery
  - Agent 能力发现
---

# 从 0 到 1 构建 Agent：M6 Skills、MCP 与能力发现

M0 到 M5，我们一直在给 Agent 建一条越来越稳的主链路。

M0 证明最小闭环能跑。M1 加了 plugin host 和 hook kernel。M2 把真实 provider SDK 拆出 core。M3 把真实工具执行收回 runtime pipeline，让文件、shell、git 这些副作用动作都经过权限、hook、调度和结果预算。M4 把模型输入变成可审计的 projection。M5 则把 session、event、artifact、resume、fork、replay 这些长任务底座落下来。

到了 M6，问题变了。

之前我们关心的是：

```text
Agent 能不能安全地调用一个工具？
```

现在要问的是：

```text
Agent 到底有哪些能力？
这些能力从哪里来？
插件启停之后发生了什么变化？
一个外部 MCP server 暴露的工具，能不能和本地工具走同一条权限和审计链路？
一个 skill 的正文，应该什么时候进入上下文？
```

这就是 M6 的目标：**让 Guga 从“能注册能力”走向“能解释能力生态”。**

这一篇讲 M6 的三件事：

1. Skills：把可复用经验做成渐进加载的能力。
2. MCP：把外部工具接进统一 tool pipeline。
3. Capability Discovery：让 runtime 能解释能力来源、命名空间、owner 和 diff。

## 一、为什么不能只靠 registerTool

一个早期 agent runtime 很容易长成这样：

```typescript
registry.registerTool(readFileTool);
registry.registerTool(shellTool);
registry.registerTool(gitDiffTool);
```

这在工具数量很少时没问题。可一旦进入真实产品，就会出现更多来源：

- host 手动注册的工具；
- first-party plugin 提供的工具；
- MCP server 暴露的远程或本地工具；
- skills 提供的任务知识；
- context policy、store、hook、replay capability；
- 未来 code-agent / deep-research-agent 自带的 profile 能力。

如果 registry 只知道“有一个叫 `read_file` 的工具”，host 就很难回答更产品化的问题：

- 这个工具是谁注册的？
- 它是内建能力、插件能力，还是 MCP 能力？
- 它属于哪个 server 或 namespace？
- 插件 reload 后它还在不在？
- 同名能力冲突时，哪个被保留，哪个被跳过？

所以 M6 先给 core 增加一个非常小的解释层：`CapabilityDescriptor`。

它不是工具本体，也不是 UI 数据模型。它只是一个可序列化的运行时说明：

```typescript
type CapabilityDescriptor = {
  type: PluginCapabilityKind;
  name: string;
  source: "host" | "plugin" | "mcp" | "built-in";
  status: "registered" | "skipped-conflict";
  namespace?: string;
  ownerPluginId?: string;
  reason?: string;
};
```

这个结构的关键在于：**描述能力，不持有能力。**

`ToolDefinition.execute`、MCP child process、skill asset 读取函数，这些都不应该进入 discovery 输出。Discovery 只负责告诉 host：

```text
当前 runtime 有哪些能力，它们来自哪里，它们是否处于可用状态。
```

这为后续 CLI、桌面/Web、code-agent 和 replay/audit 都留了同一条解释路径。

## 二、Skills：经验不是 system prompt，经验应该渐进加载

很多 agent 系统都会遇到一个诱惑：把所有“最佳实践”都塞进 system prompt。

比如：

```text
你是 TypeScript 专家。
你是 Rails 专家。
你是代码审查专家。
你是 MCP 专家。
你要遵守 200 条项目规范。
你还要知道 30 个内部工作流。
```

短期看，这很方便。长期看，它会让 context 变得又大又脏。

一个写博客的任务不需要加载数据库迁移 skill。一个 MCP 调试任务不需要加载前端设计规范。一个代码 review skill 的完整正文，也不应该在每一轮都常驻模型上下文。

参考 Claude Code、OpenCode、Hermes、DeerFlow 后，M6 采用的是三层加载：

```text
metadata 常驻
body 按需
assets 执行时读取
```

也就是：

- metadata：`name`、`description`、`location`、`namespace`、`tags`。
- body：完整 `SKILL.md` 正文，只在选中 skill 后读取。
- assets：references、templates、scripts、assets，只在执行时按路径读取。

Guga 的 `@guga-agent/plugin-skills` 做了这个最小闭环：

```text
configured roots
-> find SKILL.md
-> read frontmatter prefix
-> register SkillMetadata
-> loadSkillBody() only on demand
-> resolveSkillAssetPath() with containment guard
```

这里有两个边界很重要。

第一，plugin 不默认扫描用户全局目录。M6 只扫描 host 显式配置的 roots，避免一个 runtime 在不同机器上悄悄多出能力。

第二，metadata discovery 不读取完整正文。它只读 frontmatter 前缀，直到 `---` 结束。这样“发现能力”和“把正文放进上下文”是两件事。

这和 M4 的 context projection 是同一条哲学：模型输入不是仓库里所有可能有用的东西，而是 runtime 在某一轮选择投影给模型的内容。

## 三、MCP：外部工具必须进入同一条管线

MCP 的价值很直接：不用给每个外部系统写 Guga 专属插件。只要某个工具以 MCP server 形式暴露，runtime 就可以接进来。

但 MCP 也带来一个危险：

```text
如果 MCP client 直接执行工具，
它就绕开了 Guga 的 permission / hook / result / event / replay pipeline。
```

这会把 runtime 权限模型撕成两半。

所以 M6 的 MCP 设计很克制：

```text
MCP stdio server
-> initialize
-> tools/list
-> wrap each MCP tool as ToolDefinition
-> registerTool(..., { source: "mcp", namespace: serverName })
-> ExecutionPipeline
-> tools/call
```

也就是说，MCP server 提供工具 schema 和执行端点，但模型看到的仍然是 Guga tool。模型发起的 tool intent 仍然经过 core。

MCP tool 的名字采用：

```text
mcp__server__tool
```

比如：

```text
mcp__filesystem__read_file
mcp__github__create_issue
```

这个命名比 `server:tool` 更适合 provider tool name，也接近 Claude Code 的事实标准。它解决的是两个问题：

- 避免 MCP tool 和本地 tool 静默重名。
- 让 UI / audit 一眼能看出工具来源。

M6 只做 stdio。SSE、HTTP、WebSocket、OAuth、远程认证缓存、IDE allowlist 都后置。原因很简单：这些不是能力发现的第一性问题，它们属于更复杂的 Host Protocol / Production Ops 阶段。

## 四、Capability Diff：能力变化也要可解释

一旦有插件，就会有启停和 reload。

如果用户启用了一个 MCP server，runtime 应该能解释：

```text
added:
  - tool mcp__filesystem__read_file
  - tool mcp__filesystem__write_file

removed:
  - skill old-project-skill

changed:
  - tool search changed owner/source

skippedConflicts:
  - tool mcp__filesystem__git_status skipped because git_status already exists
```

M6 先实现了 `diffCapabilityDescriptors(before, after)` 这个纯 helper。它不要求一开始就有完整 marketplace，也不要求 UI 立刻做 reload 面板。它只是把“能力面发生变化”这件事从日志提升为 contract。

这很适合 Guga 的阶段：

- core 已有 plugin contribution cleanup。
- registry 已有 list/remove。
- M6 增加 descriptor。
- diff 只需要比较 descriptor snapshots。

后续 M7/M11 做 CLI/桌面/Web 时，就不用重新发明“插件启停之后怎么展示变化”。

## 五、Core 仍然要小

M6 看起来加了 Skills 和 MCP，但真正进入 core 的东西很少：

- `SkillMetadata`
- `CapabilityDescriptor`
- `CapabilityDiff`
- capability source / namespace / owner metadata
- `registerSkill`
- `listCapabilityDescriptors`

具体实现都在插件包里：

```text
packages/plugin-skills
packages/plugin-mcp
```

这条边界很重要。

Core 不应该知道怎么递归扫描 `SKILL.md`。Core 不应该启动 MCP server 进程。Core 不应该解析某个用户目录约定。Core 只需要知道：

```text
有一个 plugin 贡献了一个 skill metadata。
有一个 MCP source 贡献了一个 tool。
这些 capability 可以被发现、比较、清理和审计。
```

这就是小内核、大外围。

## 六、M6 给后续模块留下了什么

M6 本身不是一个显眼的产品功能。它更像把工作台的插座、电路图和标签系统铺好。

它给后续阶段留下几条能力：

- M7 / M11 的 CLI 和桌面/Web 可以展示 runtime 当前能力。
- Code Agent 可以发现项目级 skills 和 MCP tools。
- Deep Research Agent 可以把 research skills 当成按需知识，而不是常驻 prompt。
- Replay/Audit 可以解释一次 tool call 来自本地 plugin 还是 MCP server。
- Plugin reload 可以产生清晰 diff，而不是靠用户猜。

更关键的是，M6 避免了两个常见错误：

第一，把所有 skill 正文塞进 system prompt，导致上下文越来越臃肿。

第二，让 MCP 成为旁路工具执行系统，绕过 runtime 权限和审计。

Guga 选择的是更慢一点但更稳的路线：

```text
能力可以来自外部。
执行权仍然在 runtime。
上下文由 projection 决定。
能力变化必须可解释。
```

## 结尾：从“能扩展”到“能管理扩展”

做 agent runtime 时，“支持插件”只是第一步。

真正难的是：

- 插件贡献了什么？
- 模型什么时候能看到？
- 用户怎么知道它来自哪里？
- 冲突时谁赢？
- reload 后旧能力是否真的消失？
- 外部工具是否还受同一套权限约束？

M6 的答案是：先给 runtime 一套能力发现和差异解释的底座，再把 Skills 和 MCP 作为 first-party plugin 证明这套底座能承重。

这一步之后，Guga 才更像一个可编程 agent workbench，而不是一个不断往主循环里硬塞功能的 agent 应用。
