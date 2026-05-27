# M9 Code Agent Requirements

## 一句话目标

把 Guga 的现有 core/plugin/host 能力组合成第一个专业 coding agent profile，而不是把 coding 逻辑塞回 core。

## MVP

- 提供 `@guga-agent/profile-code-agent` 包，暴露 code-agent profile、默认插件 bundle、默认权限策略和 prompt/context helpers。
- 复用现有 `plugin-tools-filesystem`、`plugin-tools-shell`、`plugin-tools-git`、`plugin-skills`、`plugin-mcp`、ops 插件和 host CLI。
- 定义 code-agent 上下文包：repo snapshot、active files、git status、最近 run/audit metrics、test commands。
- 提供 test discovery helper：根据变更文件和 package scripts 推断候选验证命令。
- CLI 支持 `guga run --profile code --mock`，能以 code profile 启动本地 host/runtime。
- 所有危险动作继续走 runtime permission；profile 只配置默认策略，不绕过 permission kernel。

## 非目标

- 不实现完整 IDE/LSP code intelligence。
- 不做自动修改当前 repo 的超级 agent UI。
- 不做多 agent swarm；委派只作为后续模块。
- 不新增真实浏览器工具。
- 不把 code-agent prompt、工具筛选、测试发现写进 core。

## 用户故事

- 作为开发者，我可以用 `guga run --profile code --mock "summarize repo"` 启动 code-agent profile。
- 作为宿主应用，我可以导入 code profile bundle，用一行配置获得 provider/tools/context/permissions 的合理默认值。
- 作为测试作者，我可以对 test discovery 输入变更文件，得到稳定的候选命令和解释。
- 作为安全审阅者，我能看到 code profile 默认允许读、询问写/执行、拒绝危险命令。

## 设计约束

- Profile 是 first-party plugin bundle，不是 core 特例。
- Permission 默认 fail closed：read allow，write/shell ask，明显危险命令 deny。
- Context helpers 只返回结构化文本/资源，不直接执行工具副作用。
- CLI 仍通过 host SDK 跑，不绕过 M7/M11 host surface。
- 所有新增能力必须有 hermetic tests。

## 开放问题

- `--profile code` 是否只在 CLI 中解析，还是 host protocol 也要带 profile 字段？
- test discovery 第一版是否只看 `package.json` scripts，还是也读 package/workspace conventions？
- code-agent profile 是否应默认启用 skills/MCP，还是只注册 capability descriptors？
