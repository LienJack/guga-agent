# Context Packs

本目录用于沉淀可重复使用的小型 LLM 上下文包。目标是让“参考全项目”问题不用每次重新读取大仓库。

## 推荐主题

| 主题 | 建议文件 | 用途 |
| --- | --- | --- |
| Agent loop / ReAct runtime | `agent-loop.md` | 比较主循环、turn lifecycle、tool result 回流 |
| Tool registry / execution / permissions | `tool-registry.md` | 比较工具注册、schema、权限、并发、MCP/skills |
| Context / compaction / session recovery | `context-compression.md` | 比较压缩、裁剪、resume、event log |
| LLM provider abstraction | `provider-abstraction.md` | 比较 provider routing、fallback、streaming |
| UI / protocol / remote clients | `ui-protocol.md` | 比较 CLI/TUI/server/ACP/LSP/remote bridge |
| Multi-agent / delegation | `multi-agent.md` | 比较 subagent、worker、coordinator、trace 隔离 |
| Memory systems | `memory-systems.md` | 比较 graph memory、vector memory、user graph、thread context、SDK/tool integration |
| CLI 管理 / 本地配置中枢 | `cc-switch-core-management.md` | 研究 provider 切换、MCP/Skills/Prompts SSOT、proxy、会话管理和多 CLI 配置投影 |

## Pack 模板

```markdown
# <Topic> Context Pack

## 问题边界

## 参考项目与版本

## 必读分析材料

## 必读源码文件

## 关键抽象

## 已确认事实

## Guga 迁移判断

## 待验证问题
```

## 使用规则

1. 先用 `docs/research/source-analysis/design-ideas-index.md` 找主题入口。
2. 再用 `docs/research/repomix/*-token-tree.txt` 找候选源码路径。
3. 用 GitNexus 查询调用链和影响面。
4. 只把已筛选出的文件、源码块和判断写入 pack。
5. 每个 pack 保持小而可复用，优先控制在 4k-12k tokens。
