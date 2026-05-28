# Extension Spec And Built-in Core Capabilities

M38 将 Guga runtime capability 分成三层：core kernel、built-in core capabilities、extensions。

## Problem

早期 first-party 默认能力和可选生态能力都以 local plugin 形态进入 runtime。这样能快速复用 `PluginHost`，但 discovery、diff、权限和审计很难解释某个 capability 是默认 coding-agent substrate，还是用户/项目主动启用的 extension。

## Decision

保留一个 core-owned authority path：

```text
registry -> hooks -> permission -> execution -> result policy -> events/audit
```

然后区分三个来源层：

- **Core kernel**：contracts、registry、hook、permission、execution、event/audit、runtime composition authority。
- **Built-in core capabilities**：默认 coding-agent substrate，包括 filesystem、git、shell、AI SDK provider bridge；实现位于 `packages/core/src/builtins/*`。
- **Extensions**：可选生态能力，包括 MCP、skills、memory、artifact、replay/audit、ops/eval、delegation 等；作者 API 从 `@guga-agent/extension-sdk` 开始。

Built-ins 和 extensions 都注册到同一个 `CapabilityRegistry`，并通过同一 execution pipeline 执行。区别体现在 descriptor metadata，而不是第二套 registry。

## Built-in Rules

- Built-ins 使用 `source: "built-in"`、`layer: "built-in-core"`、`owner.kind: "core"`。
- Built-ins 可以由 runtime composition 启用、禁用或替换，但不参与 extension unload/reload。
- Built-in implementation 可以存在真实工具或 provider bridge 依赖，但只能在 `packages/core/src/builtins/*` 内部，不得被 contracts、registry、hooks、permissions、execution pipeline import。
- `@guga-agent/core/builtins` 是明确子入口；root barrel 只导出稳定 factory 和 composition API。

## Extension Rules

- Extension 使用 `layer: "extension"`，并声明 owner、source、namespace、effects、permission requirements、dependencies、lifecycle。
- `defineExtension()` 返回兼容 `LocalPlugin` 的对象；`PluginHost` 仍负责 init、shutdown、contribution cleanup 和 events。
- Extension context 会在 setup/shutdown 后失效，避免旧 async callback 在 unload/reload 后注册 stale capability。
- Extension-provided tools 仍是普通 `ToolDefinition`，必须通过 `ExecutionPipeline`、`PermissionKernel`、hooks、result policy。

## Override Policy

V1 fail closed：

- 未声明 override 的重复 capability 继续 `CAPABILITY_ALREADY_REGISTERED`。
- Extension/MCP 默认不能 override built-in tool。
- 多重/链式 extension override 不支持。
- Conflict descriptor 使用 `skipped-conflict` 或 `rejected-conflict`，`diffCapabilityDescriptors()` 会单独解释 skipped 和 rejected conflicts。
- Host-level built-in replacement 应由 runtime composition policy 表达，不伪装成 extension override。

## First-party Classification

| Package | Classification | Notes |
|---|---|---|
| `packages/core/src/builtins/filesystem.ts` | Built-in core capability | Default workspace file substrate. |
| `packages/core/src/builtins/git.ts` | Built-in core capability | Safe git read helpers and commit-message helper. |
| `packages/core/src/builtins/shell.ts` | Built-in core capability | Local shell backend with permission and timeout metadata. |
| `packages/core/src/builtins/provider-ai-sdk.ts` | Built-in core capability | AI SDK bridge/adapter, not concrete credentials or endpoint ownership. |
| `packages/plugin-tools-filesystem` | Compatibility wrapper | Re-exports core built-in filesystem path. |
| `packages/plugin-tools-git` | Compatibility wrapper | Re-exports core built-in git path. |
| `packages/plugin-tools-shell` | Compatibility wrapper | Re-exports core built-in shell path. |
| `packages/provider-ai-sdk` | Compatibility wrapper | Re-exports core built-in AI SDK bridge path. |
| `packages/plugin-mcp` | Optional extension | First dogfood for extension SDK. |
| skills, memory, artifact, replay/audit, ops/eval, delegation | Future optional extensions | Migrate incrementally using the same extension contract. |

## Verification

M38 is covered by:

- core contracts and registry tests for serializable descriptors, built-in metadata, extension metadata, conflict descriptors, and override denial;
- core runtime and builtins tests for configurable built-in composition and kernel dependency boundaries;
- compatibility package tests for filesystem/git/shell/provider-ai-sdk behavior preservation;
- extension-sdk tests for metadata injection and stale context invalidation;
- plugin-mcp runtime tests for extension dogfood and shutdown cleanup.

## Claude CLI Evaluation

只读复评结论：无 P0。第一次评估发现 `createAgentRuntime` 的静态 import 链会触发 optional AI SDK dependencies，且 root barrel 暴露过宽；实现随后改为：

- `default-core-capabilities.ts` 仅 type-import AI SDK bridge types，并在 provider `generate()` 时动态 `import("./provider-ai-sdk")`；
- root `@guga-agent/core` barrel 不再 value re-export built-ins，built-in helpers 只通过 `@guga-agent/core/builtins` 暴露；
- dependency-boundary test 覆盖 runtime/root/default composition 文件，防止静态导入 `provider-ai-sdk`、`ai` 或 `@ai-sdk/*`。

第二次复评确认：`createAgentRuntime` 不再静态加载 optional AI SDK，root barrel 不再 re-export builtins value surface，MCP extension dogfood 和 override/conflict fail-closed 语义无 P0/P1 阻断。
