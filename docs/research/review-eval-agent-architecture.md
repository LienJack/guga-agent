# Review / Eval Agent Architecture Research

## 一句话结论

M13 should follow the profile-package pattern: implement review/eval as `@guga-agent/profile-review-agent` with a findings ledger and findings-first report writer, while keeping core role-neutral.

## 项目对比

| 项目 / 来源 | 证据 | Guga 判断 |
| --- | --- | --- |
| Guga M9 Code Agent | Fact: `docs/research/code-agent-architecture.md` shows coding behavior belongs in a profile package, not core. | Adopt profile-first boundary. |
| Guga M10 Deep Research Agent | Fact: `@guga-agent/profile-deep-research-agent` separates evidence ledger and report writer from runtime execution. | Adapt ledger/report structure for review findings. |
| Guga M12 Eval Fixtures | Fact: `@guga-agent/eval-fixtures` maps failures to layers and covered risks. | Adapt risk metadata and layer language for review categories. |
| Tool Registry Context Pack | Fact: tool execution risk centers on permission, hooks, scheduler, result policy, and MCP/skills surfaces. | Review findings should categorize tool/permission/context/session/protocol/profile risks. |
| Code Review Workflow | Fact: project review instructions prioritize bugs, regressions, missing tests, and file/line grounded findings. | Adopt findings-first output and avoid changelog-style review reports. |

## 可借鉴模式

- Review is a role profile, not a new agent loop.
- Findings need stable ids, severity, category, confidence, and evidence.
- Reports should lead with findings and put summary later.
- Review/eval should map risks to layers so owners can route fixes.

## 不建议照搬

- Do not integrate GitHub review comments in M13.
- Do not auto-edit code from the review profile.
- Do not add code-review control flow to `packages/core`.
- Do not build a benchmark dashboard.

## Guga 落点

1. Add `packages/profile-review-agent`.
2. Export profile metadata and system prompt.
3. Export finding ledger helpers.
4. Export review report writer and diagnostics.
5. Teach CLI `--profile review`.

## 证据

- Fact: M9 implementation kept coding behavior out of core.
- Fact: M10 implementation proves profile packages can own ledger/report helpers.
- Fact: M12 implementation proves eval metadata can be package-owned and hermetic.
- Inference: A review/eval profile can provide useful product behavior now without a PR platform integration.
