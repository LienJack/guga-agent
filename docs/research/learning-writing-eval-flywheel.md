# Learning, Writing, And Evaluation Flywheel Research

## 一句话结论

M12 should make module learning artifacts executable enough to be trusted: keep research and writing discoverable in indexes, encode eval scenarios as hermetic fixtures, and make the module checklist a repeatable contract.

## 项目对比

| 项目 / 来源 | 证据 | Guga 判断 |
| --- | --- | --- |
| Guga roadmap | Fact: `docs/roadmap.md` defines M12 as research, solution, blog, eval, and checklist flywheel. | Adopt as a first-party module, not background maintenance. |
| Existing eval runner | Fact: `packages/plugin-eval-runner` already runs hermetic mock-provider fixtures and returns diagnostics. | Adapt by adding a cross-module fixture registry package instead of building a dashboard. |
| M5 planning docs | Fact: M5 plans session/event/artifact/replay as the substrate for future eval and learning. | Adopt M5 as the missing article and as an eval fixture category. |
| Claude Code writing reference | Fact: local `learn-agent` guide structures articles from problem to runtime mechanism to source evidence. | Adapt the writing rhythm; do not copy source conclusions or implementation details. |
| M10 research profile | Fact: `@guga-agent/profile-deep-research-agent` exports evidence ledger and report helpers. | Reuse the evidence discipline in docs; defer automated report generation. |

## 可借鉴模式

- Treat docs as navigation infrastructure, not as leftovers after implementation.
- Keep eval fixtures hermetic so they can run in CI and local sessions without credentials.
- Add metadata around fixtures so failures map to provider/tool/context/permission/session/protocol layers.
- Use module articles as a learning path with stable naming and a repeated story arc.
- Make the completion checklist visible enough that future agents can self-audit.

## 不建议照搬

- Do not copy Claude Code article text or product-specific conclusions.
- Do not turn M12 into a benchmark platform.
- Do not add flaky external web/search fixtures.
- Do not make eval data depend on private local sessions.
- Do not rebuild the M8 eval runner when a registry package is enough.

## Guga 落点

1. Add `@guga-agent/eval-fixtures`.
2. Export module-category fixture metadata and manifest validation.
3. Add fixtures for capability discovery, host protocol, operations, code agent, and deep research.
4. Update `docs/research/index.md`.
5. Add a completion checklist solution note.
6. Fill missing M5 and M12 articles.

## 证据

- Fact: `docs/roadmap.md` M12 requires research, brainstorm, plan, solution, blog, eval, and finish artifacts.
- Fact: `任务.md` M12 explicitly calls out the missing M5 article and eval/replay dataset categories.
- Fact: `packages/plugin-eval-runner/src/eval-runner.ts` already provides `EvalFixture` and `runEvalSuite`.
- Fact: `docs/plans/2026-05-27-002-feat-session-store-replay-plugins-plan.md` frames M5 as durable replay substrate.
- Fact: `/Users/lienli/Documents/GitHub/learn-agent/src/content/blog/zh/AI/3.ClaudeCode源码解析/00.系列导读.md` uses problem-first module storytelling.
- Inference: A typed fixture registry gives Guga a durable eval surface without committing to a dashboard or external benchmark too early.
