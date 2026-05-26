# brainstorm: M1 插件宿主与 Hook Kernel

## Goal

M1 要证明 Guga core 在进入真实 provider 插件阶段之前，已经可以通过本地插件获得 provider、tool 和 hook 能力。目标是建立最小插件闭环：宿主应用能挂载插件，插件作者能注册能力，core 能消费插件能力完成最小 agent run，并在生命周期结束时清理插件状态。

## What I already know

- 已确认 M1 重心是“最小插件闭环”，不是完整插件生态。
- M1 范围是完成 M2 之前的插件基础，不进入真实 provider transport。
- 首要证明点是注册能力优先：插件把能力注册进 core，core 从 registry / runtime 边界消费。
- 首批能力限定为 provider、tool、hook。
- M1 不做 reload / hot reload。
- M1 hook surface 限定为生命周期 hook 与 pre-tool gate hook。
- e2e 证明使用一个综合示例插件，该插件同时注册 provider、tool、hook。
- Namespace、同名冲突、能力覆盖治理不作为 M1 硬验收。
- 成功标准同时面向宿主应用开发者和插件作者。
- 需求来源文档：`docs/brainstorms/2026-05-26-m1-plugin-host-hook-kernel-requirements.md`。

## Assumptions (temporary)

- M0 core contracts、registry、event bus、runtime facade、mock provider 和 test tool 行为已经可用。
- M1 可以复用现有 core capability 概念表达插件提供的 provider 和 tool。
- M1 本地插件视为可信开发期 extension；marketplace、签名、sandbox、第三方 trust policy 后置。
- M1 的 debug/test 可观察性可以通过 runtime events 或等价 core-observable 机制满足。

## Open Questions

- 无阻塞产品问题；剩余问题进入规划阶段作为技术决策处理。

## Requirements (evolving)

- 宿主应用必须能在创建或配置 Guga runtime 时挂载本地插件。
- 宿主侧路径不能要求宿主手动把每个插件提供的 provider、tool 或 hook 接入 core 内部细节。
- 带插件的 runtime 必须能使用插件注册能力完成最小 agent run。
- M1 必须定义本地插件最小形态，让插件作者能够提供初始化和 shutdown 行为。
- 本地插件必须能注册 provider、tool 和 M1 hook surface 内的 hook。
- M1 必须包含一个综合示例插件，在同一个插件内注册 provider、tool 和 hook。
- M1 必须支持 session/runtime start 与 shutdown 生命周期 hook。
- M1 必须支持 pre-tool gate hook，可以在工具执行前允许或阻断模型提出的 tool call。
- Hook 执行必须对测试足够受控：有确定性顺序、隔离直接 core state mutation，并在 gate decision 或失败时可观察。
- 插件初始化、能力注册、hook decision、hook failure 和插件 shutdown 必须对自动化测试与 debug inspection 足够可观察。
- 插件 shutdown 必须为加载它的 runtime 实例清理插件生命周期状态。
- 插件初始化、hook 执行或 shutdown 失败时，必须以结构化 runtime failure 或事件暴露。

## Acceptance Criteria (evolving)

- [ ] 宿主使用综合示例插件创建 runtime 后，可以用插件注册的 provider 与 tool 完成一个最小 user turn。
- [ ] 示例插件注册的 pre-tool gate hook 可以阻断指定 tool call，且被阻断的 tool 不会执行。
- [ ] Gate decision、hook failure、插件初始化和 shutdown 对测试可观察。
- [ ] Runtime shutdown 会触发插件 shutdown 行为，shutdown failure 不会被静默吞掉。
- [ ] 插件作者能通过示例插件和测试识别 provider、tool、hook 如何通过同一本地插件形态注册。

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 不实现真实 OpenAI、Anthropic、Gemini 或 OpenAI-compatible provider 插件。
- 不实现 provider fallback、stream normalization、usage normalization、cost normalization、credential routing 或 provider-specific error taxonomy。
- 不实现 plugin reload / hot reload。
- 不把 namespace、同名冲突或能力覆盖治理作为硬验收。
- 不实现 command 注册。
- 不实现 resource discovery、model input patching、tool result post-processing、context compaction hook 或 projection hook。
- 不实现 marketplace、remote install、sandbox、signing、trust policy 或 enterprise allowlist。
- 不实现 MCP、skills、session store、replay 或 host adapter。

## Technical Notes

- 主要需求文档：`docs/brainstorms/2026-05-26-m1-plugin-host-hook-kernel-requirements.md`。
- Roadmap 入口：`docs/roadmap.md` 的 M1 “Plugin Host And Hook Kernel”。
- M0 规划参考：`docs/plans/2026-05-26-001-feat-core-kernel-runtime-plan.md`。
- 当前代码基线位于 `packages/core`，包含 loop、runtime、registry、events、contracts、testing support。
- 规划阶段需要回答：
  - 哪种宿主侧插件挂载 API 最贴合现有 runtime facade？
  - M1 应采用什么最小本地插件 packaging 形态？
  - 哪些事件名称和 payload 粒度足以满足 M1 可观察性？
  - 当前 M0 runtime 生命周期能强制哪些清理保证？
