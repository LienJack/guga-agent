# Production Operations Runtime

## 一句话结论

M8 应采用 **plugin-first production substrate**：provider health、credential/config、audit export、trust/scope、eval/replay、metrics 都通过 core contracts + first-party packages 接入；core 只补稳定类型，不拥有运营产品面。

## 项目对比

| 项目 | 证据 | Guga 判断 |
| --- | --- | --- |
| Hermes Agent | Fact: `docs/research/context-packs/provider-abstraction.md` 总结 Hermes 有 credential pool、402/429/401 轮换、辅助模型路由、prompt caching、models.dev。 | Adopt health/config/credential contracts；Adapt credential pool 为后续阶段，M8 先做 env/static resolver 和 redaction。 |
| Hermes fault tolerance | Fact: `docs/research/context-packs/agent-loop.md` 记录 Hermes 中断传播、health check、Gateway 重启续跑。 | Adopt event-derived health and interruption diagnostics；不要在 M8 建完整 gateway supervisor。 |
| OpenCode | Fact: `docs/research/context-packs/provider-abstraction.md` 记录 OpenCode 统一 Vercel AI SDK provider metadata，包括 model limit/cost/capabilities。 | Adopt provider/model metadata and capability visibility for host surfaces。 |
| Claude Code | Fact: `docs/research/source-analysis/claude-code-analysis/analysis/01-architecture-overview.md` 和 `06-extra-findings.md` 强调 trust 前后初始化差异、telemetry/trust 时序保护。 | Adapt trust/scope descriptor：配置和 telemetry/metrics 不能早于 workspace trust。 |
| DeerFlow | Fact: `docs/research/source-analysis/design-ideas-index.md` 将 config/deployment/config-reference 列为 productionization 入口。 | Adapt configuration-as-code 思路；M8 先做 typed config resolver，不做部署平台。 |
| Guga M6/M7 | Fact: `docs/solutions/architecture-patterns/plugin-capability-discovery.md` 和 `docs/solutions/architecture-patterns/host-protocol-cli-workbench.md` 已有 capability descriptors 和 host surface。 | M8 应扩展这些 surface，而不是另建 ops API。 |

## 可借鉴模式

1. **Provider health 是 descriptor，不是一次聊天失败后的字符串**  
   Fact: OpenCode/Hermes 都围绕 provider/model metadata 做能力和成本解释。Guga 应让 health、model limits、capabilities、cost status 成为 typed data。

2. **Credential resolver 必须先有 redaction contract**  
   Fact: Hermes 的 credential pool 复杂且生产必要，但第一步是保证凭据不会进入 event/debug/audit。M8 应先做 env/static resolver + redacted view。

3. **Metrics 从事件派生**  
   Inference: Guga 已经有 EventBus 和 HostEvent；run/tool/permission/provider/usage metrics 应从事件流聚合，避免埋点散在业务代码里。

4. **Audit export 是 replay/eval 的邻居**  
   Fact: Guga M5 已有 event/session/replay substrate，M6/M7 已把 capability 和 host event 暴露出来。M8 的 audit exporter 应读事件和资源，而不是调用 UI。

5. **Trust/scope 要进入 capability discovery**  
   Inference: M6 descriptor 已能解释 owner/source/status；M8 加 trust/scope 后，CLI/desktop 才能展示“这个能力为什么可用、由谁提供、允许做什么”。

## 不建议照搬

- **不照搬 Hermes 完整 credential pool**：多 key 租约、冷却、OAuth 同步很重要，但需要更成熟的 provider config 和 host UX。
- **不照搬 OpenCode 全量 provider catalog**：models.dev/provider catalog 应后置；M8 先定义 contract。
- **不先接外部 telemetry SaaS**：先做 in-memory metrics snapshot 和 audit export，避免隐私和 trust 时序风险。
- **不把 eval 做成大平台**：M8 只需要 replay/eval fixture runner，为 M9/M10 提供回归地基。

## Guga 落点

### 第一批包/修改

- `packages/core`: 只在必要时扩展 descriptor metadata、health/audit/metrics contract。
- `packages/plugin-ops-health`: provider/capability health checks and redacted config views。
- `packages/plugin-audit-export`: event-derived audit summaries。
- `packages/plugin-eval-runner`: local replay/eval fixtures。
- `packages/host-runtime` / `host-protocol`: expose operational resources if needed by CLI/workbench。

### 实施结果

- `packages/core/src/contracts/operations.ts`: added `ProviderHealth`, `CredentialConfigView`, `AuditSummary`, `MetricsSnapshot`, and `TrustDescriptor`.
- `packages/plugin-ops-health`: resolves env/static credential views with redaction and mockable provider health checks.
- `packages/plugin-audit-export`: projects `AgentEvent[]` into audit summaries and metrics snapshots without copying prompts, tool inputs, or outputs.
- `packages/plugin-eval-runner`: runs hermetic mock-provider fixtures and returns structured pass/fail diagnostics.
- `packages/host-protocol` / `host-runtime` / `host-local-server` / `host-sdk`: expose operations health, audit, metrics, and status resources through typed DTOs and HTTP endpoints.
- `packages/cli`: `guga run --ops` prints a compact operational status line without exposing credential material.

### 第一批 DTO

- `ProviderHealthResource`: providerId, modelId, status, checkedAt, diagnostics。
- `CredentialConfigResource`: providerId, source, status, redacted keys。
- `AuditSummaryResource`: runId, tool counts, permission decisions, usage totals, failures。
- `MetricsSnapshot`: counters and last-updated timestamps。
- `TrustDescriptor`: trustLevel, scopes, ownerPluginId, source。

### 验收优先级

1. Credentials never leak in health/audit/debug output.
2. Health/audit/metrics can be produced from mock runs.
3. Capability descriptors carry enough trust/scope metadata for host/CLI display.
4. Eval runner can execute one hermetic fixture without real provider credentials.

## 证据

- Fact: `docs/research/context-packs/provider-abstraction.md` documents Hermes credential pool strategies, OpenCode provider metadata, models.dev, prompt caching, and Guga migration judgment.
- Fact: `docs/research/context-packs/agent-loop.md` documents health check and fault-tolerance lessons from Hermes.
- Fact: `docs/research/source-analysis/design-ideas-index.md` lists productionization references for DeerFlow config/deployment, Hermes fault tolerance/config/session management, and OpenCode utility/integration docs.
- Fact: `docs/solutions/architecture-patterns/plugin-capability-discovery.md` documents Guga's current capability descriptor/diff design.
- Fact: `docs/solutions/architecture-patterns/host-protocol-cli-workbench.md` documents Guga's host protocol and CLI surface.
- Inference: M8 should be plugin-first because the roadmap explicitly keeps core small and makes CLI/desktop consume runtime events/protocol.
- Fact: M8 placed trust/scope directly on `CapabilityDescriptor` as optional metadata and preserved older descriptor callers.
