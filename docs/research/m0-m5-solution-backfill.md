# M0-M5 Solution Backfill Research

## 一句话结论

M0-M5 already have enough plan and blog evidence to backfill solution notes: the early architecture arc is core loop -> plugin surface -> provider bridge -> tool permission runtime -> context projection -> durable replay.

## 项目对比

| 模块 | 证据 | Guga 判断 |
| --- | --- | --- |
| M0 | Fact: `docs/plans/2026-05-26-001-feat-core-kernel-runtime-plan.md` and `blog/build-agent-from-zero-m0-core.md` define a minimal provider/tool loop. | Adopt core-owned contracts and mock-first validation as the base pattern. |
| M1 | Fact: `docs/plans/2026-05-26-002-feat-plugin-host-hook-kernel-plan.md` and M1 blog define local plugin and hook control boundaries. | Adopt PluginHost + HookKernel split. |
| M2 | Fact: `docs/plans/2026-05-26-003-feat-provider-ai-sdk-bridge-plan.md` defines AI SDK as bridge outside core contracts. | Adapt AI SDK as default transport while preserving Guga provider semantics. |
| M3 | Fact: `docs/plans/2026-05-26-004-feat-tool-permission-runtime-plan.md` and M3 blog define core-owned tool execution. | Adopt execution pipeline and permission kernel as the real-action boundary. |
| M4 | Fact: `docs/plans/2026-05-27-001-feat-context-policy-plugins-plan.md` and M4 blog define model input as projection. | Adopt projection/context policy as the context control plane. |
| M5 | Fact: `docs/plans/2026-05-27-002-feat-session-store-replay-plugins-plan.md` and M5 blog define durable events and replay. | Adopt append-only events, artifact refs, and non-mutating replay as the durable substrate. |

## 可借鉴模式

- Early modules should be recorded as reusable architectural patterns, not only implementation history.
- Each note should state problem, decision, why this shape, limits, and verification.
- M0-M5 form a dependency chain; each note should say which later module it enables.

## 不建议照搬

- Do not duplicate long blog explanations inside solution notes.
- Do not update old implementation code in a documentation backfill.
- Do not retroactively claim future capabilities were present in early modules.

## Guga 落点

1. Add six `docs/solutions/architecture-patterns/*` notes.
2. Update `docs/research/index.md` with M0-M4 rows.
3. Keep scope to knowledge backfill.

## 证据

- Fact: `任务.md` requires checking M0-M5 solution records and backfilling missing compound notes.
- Fact: `docs/roadmap.md` M12 says every module should leave research, solution, blog, and eval/checklist artifacts.
- Fact: M0-M5 all have plans and module articles available locally.
- Inference: Solution notes should be compact decision records because the detailed narrative already lives in blogs and plans.
