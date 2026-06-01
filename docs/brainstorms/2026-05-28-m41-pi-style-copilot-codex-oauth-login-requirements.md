---
date: 2026-05-28
topic: m41-pi-style-copilot-codex-oauth-login
---

# M41 Pi-style Copilot 与 Codex OAuth 登录需求文档

## 摘要

Guga 将在 M40 之后补齐 Pi-style 账号登录闭环：用户可以从 Guga 登录 GitHub Copilot 与 OpenAI/Codex，看到对应模型变为可用，选择这些模型，并通过 Guga 正常 runtime 发起真实模型调用。

---

## 问题背景

M40 会为 Guga 提供多 provider auth/config/model availability 的基础，但计划中的 MVP 仍把 OAuth 作为后续工作。这会留下一个高价值用户路径：已经拥有 Copilot 或 Codex 订阅访问权限的用户，更期待 agent CLI 提供账号登录流程，而不只是 API key 配置。

Pi 展示了目标产品感：登录是 provider-aware 的工作流，凭证存储在本地，工具负责 refresh，`/models` 会反映 auth 状态，被选中的模型也能真的运行。Guga 需要同样的产品闭环，同时保留自己的 runtime authority：auth 属于 CLI/host 产品面，模型可用性属于 resolved model view，provider 调用仍然经过 Guga provider contract 与 router events。

---

## 参与者

- A1. Guga CLI / workbench 用户：登录、登出、选择 Copilot 或 Codex 模型，并期望模型可用性与账号状态一致。
- A2. Guga CLI / workbench host：拥有 provider-aware 登录 UI、credential storage、credential refresh、redacted diagnostics 和 model availability 更新。
- A3. Guga runtime/router：消费选中的 provider/model credential，并发出可观察的 model selection、provider、error 和 usage events。
- A4. Provider bridge 维护者：把 Copilot/Codex transport 差异隔离在 Guga core public contract 之外。
- A5. 规划 / 实施 agent：基于本文档在 M40 之后继续规划，不重新发明 OAuth 产品行为。

---

## 关键流程

- F1. GitHub Copilot 登录
  - **触发：** 用户运行登录命令，或在 `/login` 中选择 GitHub Copilot。
  - **参与者：** A1, A2
  - **步骤：** Guga 启动 device-code flow，展示 verification URL 和一次性 code，尽量自动打开浏览器，等待用户授权，存储得到的 credential，并报告成功或可操作失败。
  - **结果：** GitHub Copilot auth 被配置到 Guga-owned local storage，并能立即影响模型可用性。
  - **覆盖：** R1, R2, R3, R4, R5

- F2. OpenAI / Codex 登录
  - **触发：** 用户运行登录命令，或在 `/login` 中选择 OpenAI/Codex。
  - **参与者：** A1, A2
  - **步骤：** Guga 启动浏览器 OAuth flow，在可用时接收 local callback，在 callback 无法完成时提供手动粘贴 fallback，存储得到的 credential，并报告成功或可操作失败。
  - **结果：** OpenAI/Codex auth 被配置到 Guga-owned local storage，并能立即影响模型可用性。
  - **覆盖：** R1, R2, R3, R4, R5

- F3. Auth-aware 模型发现与选择
  - **触发：** 用户打开 `/models`、运行 `--list-models`，或在登录/登出后选择模型。
  - **参与者：** A1, A2, A3
  - **步骤：** Guga 刷新 model availability view，根据 auth 状态把 Copilot/Codex 模型标记为可用或不可用，在不暴露 secret 的前提下解释不可用原因，并允许选择可用模型发起 run。
  - **结果：** 用户能理解 Copilot/Codex 模型是否可用，并且无需手动编辑 config 即可选择模型。
  - **覆盖：** R6, R7, R8, R9, R10

- F4. 使用 OAuth-backed 模型运行
  - **触发：** 用户用 Copilot 或 Codex 模型启动 run。
  - **参与者：** A1, A2, A3, A4
  - **步骤：** Guga 解析选中的模型，通过 host/auth 层获取或刷新 credential，把 redacted runtime config 传给 provider bridge，经由 Guga runtime 路由模型调用，并记录实际使用的 provider/model。
  - **结果：** 模型调用通过 Guga 正常 provider contract 成功完成，或以可分类、可观察的 auth/provider error 失败。
  - **覆盖：** R9, R10, R11, R12, R13, R14

- F5. 登出与 stale credential 恢复
  - **触发：** 用户登出、token 过期，或 refresh 失败。
  - **参与者：** A1, A2, A3
  - **步骤：** Guga 移除或刷新相关 stored credential，更新模型可用性，保留 redacted diagnostics，并在需要时引导用户重新登录。
  - **结果：** stale credential 不会让模型看起来仍可用；登出会让 provider 变为不可用，且不会泄漏 token material。
  - **覆盖：** R3, R5, R7, R15, R16

---

## 需求

**Pi-style 登录闭环**
- R1. Guga 必须提供 provider-aware 登录入口，让用户可以选择 GitHub Copilot 或 OpenAI/Codex，而不需要手动编辑 config。
- R2. GitHub Copilot 必须支持适合 CLI 使用的 device-code OAuth flow，包括可见 URL/code、尝试打开浏览器、等待状态、取消、超时和成功/失败反馈。
- R3. OpenAI/Codex 必须支持适合 CLI 使用的浏览器 OAuth flow，包括可用时的 local callback，以及 callback 无法完成时的手动 code 或 redirect URL 粘贴 fallback。
- R4. 登录状态必须足够可见，让用户能区分 unconfigured、configured、expired/refresh-failed 和 logged-out，且不暴露 token 值。
- R5. Guga 必须拥有这些 provider 的 OAuth session state，而不是依赖 GitHub CLI、Copilot CLI、Codex CLI 或其他外部工具的登录状态。

**Credential storage 与生命周期**
- R6. OAuth credentials 必须存储在 Guga-owned local storage 中，并符合 Guga Home 模型；本地文件权限必须收紧，或使用等价的安全存储路径。
- R7. Credential storage 必须支持 token refresh 和并发 Guga 进程安全，避免多个 session 同时 refresh 时损坏或竞争 refresh state。
- R8. Logout 必须移除所选 provider 的 Guga stored credential，并立即更新 provider/model availability。
- R9. Diagnostics、status、logs 和 runtime metadata 绝不能打印 access token、refresh token、raw auth payload 或包含 secret 的 headers。

**模型可用性与选择**
- R10. Copilot 和 Codex 模型必须进入与 M40 provider 相同的 resolved model availability view，而不是维护独立模型列表。
- R11. 登录前可以展示 Copilot/Codex 模型为 unavailable，但 UI 必须解释阻塞原因是 missing auth 或 failed auth。
- R12. 登录成功后，Copilot/Codex 模型必须能通过其他 provider 使用的同一套 CLI/workbench model selection surface 被选择。
- R13. 使用 Copilot/Codex 模型的 run 必须记录实际 provider/model identity，而不只是用户可见 alias。

**Runtime 与 provider 行为**
- R14. 被选中的 Copilot 或 Codex 模型必须能通过 Guga 正常 runtime/provider contract 运行，包括 text output、tool intent handling、可用时的 usage/error normalization，以及可观察 provider events。
- R15. 运行中发生 credential refresh 或 auth failure 时，必须表现为 router 与 diagnostics 可观察的 auth/provider failure，而不是 opaque bridge crash。
- R16. Copilot 或 Codex 所需的 provider-specific details 必须隔离在 provider/auth/bridge 层，不得变成 Guga core public contract types。

**Provider policy**
- R17. GitHub Copilot OAuth 与 OpenAI/Codex 登录是本里程碑第一批优先路径。
- R18. Anthropic/Claude 在本里程碑继续以官方 API key / Workload Identity Federation 为主；consumer Claude OAuth 不是默认产品承诺。
- R19. DeepSeek 与 Kimi/Moonshot OAuth 不属于本里程碑；它们继续通过 API key 或 OpenAI-compatible provider 配置接入。

---

## 验收示例

- AE1. **覆盖 R1, R2, R4, R6。** 给定没有存储 GitHub Copilot credential，当用户运行 Copilot 登录并完成 device authorization 后，Guga 会本地存储 credential，展示 configured 状态，并且不打印 token 值。
- AE2. **覆盖 R1, R3, R4, R6。** 给定没有存储 OpenAI/Codex credential，当用户启动 Codex 登录且 local callback 成功后，Guga 会本地存储 credential，并标记 Codex auth configured。
- AE3. **覆盖 R3。** 给定 local callback 因远程浏览器或 callback port 不可用而无法完成，当用户粘贴最终 redirect URL 或 authorization code 后，Guga 仍能完成登录或给出可操作失败信息。
- AE4. **覆盖 R7, R15。** 给定 stored OAuth credential 已过期，当 run 或 model discovery 需要 credential 时，Guga 会安全 refresh；如果 refresh 失败，模型会变为不可用，或 run 以 auth-classified error 失败并给出重新登录路径。
- AE5. **覆盖 R10, R11, R12。** 给定用户尚未登录，当打开 `/models` 时，Guga 会解释 Copilot/Codex 模型被 missing auth 阻塞；登录后，同一 surface 会展示这些模型可用并可选择。
- AE6. **覆盖 R13, R14, R16。** 给定用户选择 Copilot 或 Codex 模型运行，当模型调用成功后，runtime/session diagnostics 会记录实际 provider/model 和正常 Guga model events，且不暴露 provider SDK 或 OAuth token internals。
- AE7. **覆盖 R8, R11。** 给定用户登出 Copilot 或 Codex，当再次打开 `/models` 时，该 provider 的模型不再可选择，unavailable reason 反映 missing auth。

---

## 成功标准

- 用户可以从 Guga 登录 GitHub Copilot 或 OpenAI/Codex，看到 provider 变为 configured，选择模型，并在不手动编辑 provider config 的情况下完成至少一次模型调用。
- `/models`、`/model`、`--list-models`、status 和 run metadata 对 Copilot/Codex 模型是否可用、实际使用哪个 provider/model 的判断保持一致。
- 登录、refresh、logout 和 auth failure 路径可理解，并且不会泄漏 secrets。
- `ce-plan` 可以直接规划 auth storage、provider login flows、model availability integration、runnable provider wiring、diagnostics 和 tests，而不需要发明产品行为。

---

## 范围边界

- 本里程碑不实现 DeepSeek 或 Kimi/Moonshot OAuth。
- 本里程碑不把 consumer Claude OAuth 作为受支持的默认路径。
- 本里程碑不实现 credential pools、account rotation、quota governance、cooldown recovery、team billing 或 enterprise key management。
- 本里程碑不要求与 GitHub CLI、Copilot CLI、Codex CLI、Claude Code 或其他外部工具 credential stores 同步。
- 本里程碑不在 Guga core public contracts 中暴露 OAuth token formats、provider SDK types 或 provider-specific auth payloads。
- 本里程碑不要求 workbench UI 与 CLI 完全 parity，除非 planning 发现它能低成本复用 CLI flow。
- 本里程碑不构建 provider marketplace 或动态 third-party OAuth provider installation。

---

## 关键决策

- **采用 Pi-style Guga-owned sessions：** Guga 拥有 login、storage、refresh、logout 和 availability state，让产品能解释自己，而不是依赖另一个 CLI 的隐藏状态。
- **同时优先 Copilot 与 Codex：** Copilot 是最稳的 OAuth proof，Codex 的用户价值足够高，不应被推迟到 generic API key 支持之后。
- **对 Anthropic 保守：** Claude 继续以 API key / WIF 为主，直到受支持的 consumer-account OAuth 路径被验证并被明确接受。
- **让登录立即影响模型可用性：** 用户可见价值不是“token 已保存”，而是“这些模型现在可以选择并运行”。
- **保持 Guga runtime authority：** OAuth 只负责解析 credentials；tool execution、fallback、events 和 provider contract 行为仍由 Guga 拥有。

---

## 依赖 / 假设

- 依赖 `docs/plans/2026-05-28-040-feat-multi-provider-login-switch-ai-sdk-plan.md` 中的 M40 provider/auth/model availability 基础。
- 假设 M40 继续把 credential policy 放在 CLI/host 层，把 AI SDK/provider bridge 作为 runtime adapter，而不是 public core contract。
- 假设 GitHub Copilot OAuth 继续可用于 CLI-style device login，并且 Guga 可以在用户授权的账号上下文中使用它。
- 假设 OpenAI/Codex account login 在技术上仍足以支撑 Pi-style flow，但 planning 必须在实施前重新验证当前 endpoint 与 policy constraints。
- 假设 login-state behavior、token refresh behavior、model availability 和 provider wiring 可以用 hermetic tests 覆盖，真实网络 smoke tests 保持可选。

---

## 待解决问题

### 留待规划阶段

- [影响 R2, R14][Needs research] 实施时 Guga 应使用哪条 GitHub Copilot model endpoint 与 token exchange path？哪些部分是官方 SDK-supported，哪些属于 compatibility behavior？
- [影响 R3, R14][Needs research] 当前可接受的 OpenAI/Codex OAuth 与 model-call route 是什么？
- [影响 R6, R7][技术] 第一版应只使用 file-backed Guga Home storage，优先使用 OS keychain，还是采用 layered secure-storage strategy？
- [影响 R10, R12][技术] 首批 Copilot/Codex model aliases 应如何作为 built-in 暴露，并如何映射到 M40 provider/model metadata？
- [影响 R14, R15][技术] 第一条 runnable slice 应 normalize 哪些 provider error cases，哪些留给后续 provider hardening？
