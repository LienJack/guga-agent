# 参考项目索引建设进度

## 工具覆盖矩阵

| 项目 | Repomix Token Tree | Repomix Context | GitNexus | Understand-Anything | Graphify |
|---|---|---|---|---|---|
| blade-agent-sdk | done | done (full) | done | **done (POC)** | done (1799n/4359e/36c) |
| blade-code | done | done (full) | done | **done** (1345n/1811e/12L/13T) | done (2856n/6308e/120c) |
| cc-haha | done | done (full) | done | **done** (1598n/3172e/16L/14T) | done (14403n, no-viz) |
| claude-code | done | done (focused) | done | **done** (1920n/778e/12L/14T) | done (15047n, no-viz) |
| deepagentsjs | done | done (full) | done | **done** (106n/91e/12L/12T) | done (1066n/1741e/80c) |
| deer-flow | done | done (full) | done | **done** (4410n/8454e/12L/12T) | done (850n/860e/225c) |
| hermes-agent | done | done (focused) | done | **done** (303n/1025e/12L/15T) | done (1905n/3747e/116c) |
| opencode | done | done (full) | done | **done** (742n/1101e/12L/14T) | done (8023n, no-viz) |

## Understand-Anything POC 结果

### blade-agent-sdk (2026-05-14)

| 维度 | 数据 |
|---|---|
| 项目 | @blade-ai/agent-sdk |
| Commit | 5d67e5edd4e5e281e9349449d741f8a0dfe1054b |
| 文件扫描 | 349 (code:325, docs:16, config:5, infra:2, script:1) |
| 节点 | 754 (file:326, function:317, class:79, document:16, config:5, pipeline:11) |
| 边 | 1,950 (imports:1162, contains:405, exports:223, tested_by:109, calls:17, depends_on:6, inherits:4, documents:14, related:3, triggers:3, configures:4) |
| 层 | 10 (Agent 核心层, 会话管理层, 工具系统层, 上下文与记忆层, MCP 集成层, Hook 与沙箱层, 运行时与服务层, 基础类型与工具函数层, 文档层, 基础设施与配置层) |
| Tour 步数 | 12 |
| Graph 文件 | 798 KB |
| 验证 | 0 issues, 5 orphan warnings |

### 执行模式

- 宿主：Enter CLI (general-purpose subagent)
- Phase 0-0.5: 直接 Bash
- Phase 1 SCAN: 1 个 subagent（写 + 跑 Node 脚本）
- Phase 2 ANALYZE: 18 批 × 1 subagent，5 并发 × 4 轮
- Phase 3 MERGE: merge-batch-graphs.py（Python 脚本）+ 1 subagent assemble-reviewer
- Phase 4 ARCHITECTURE: 1 subagent
- Phase 5 TOUR: 1 subagent
- Phase 6 REVIEW: inline Node.js validator + 手动修复 9 个 step 节点 layer 分配
- Phase 7 SAVE: 直接 Bash

总 subagent 调度：22 次（1 scanner + 18 file-analyzer + 1 reviewer + 1 architecture + 1 tour）

### POC 结论

1. **可行性：完全通过**。Enter CLI 能完整模拟 Understand-Anything 的多 agent pipeline，产出合法 knowledge-graph.json。
2. **时间成本**：大约 45-60 分钟（含等待 subagent 回复）。
3. **已知问题**：
   - file-analyzer 偶尔遗漏单导出函数的 function 节点（导致跨批次 calls 边悬挂）
   - architecture-analyzer 不自动处理 `step:` 前缀节点的 layer 分配（需手动补）
   - `config:` vs `file:` 前缀不一致导致 importMap 边丢失（reviewer 修复）
4. **批量推广建议**：
   - 可以按相同模式跑剩余 7 个项目
   - 大仓（hermes-agent 3150 files / cc-haha 2647 / opencode 2970）建议分域 focused analyze 或分 subdomain 图谱
   - 建议优先跑 opencode（Go, 对 guga 最有参考价值）和 claude-code（JS/TS, 产品形态最接近）

## Context Pack 建设

| 主题 | 状态 | 相关项目 |
|---|---|---|
| agent-loop | done | all |
| tool-registry | done | blade-agent-sdk, claude-code, hermes-agent, opencode |
| context-compression | done | claude-code, hermes-agent, opencode |
| provider-abstraction | done | blade-agent-sdk, claude-code, opencode |
| ui-protocol | done | cc-haha, deepagentsjs, deer-flow |
| multi-agent | done | hermes-agent, deepagentsjs, deer-flow |
