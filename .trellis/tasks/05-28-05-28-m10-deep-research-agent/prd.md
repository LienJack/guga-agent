# M10 Deep Research Agent PRD

## Summary

Build a first-party deep-research-agent profile with evidence ledger and report pipeline helpers.

## Goals

- Ship `@guga-agent/profile-deep-research-agent`.
- Encode the project's 7-layer research funnel as a source policy.
- Provide evidence ledger and report writer helpers.
- Add CLI `--profile deep-research`.

## Non-Goals

- No raw source-first research.
- No external web search automation in MVP.
- No automatic code edits.
- No vector DB.
- No swarm/subagent execution.

## Requirements

1. The profile exports stable metadata and prompt helper.
2. Source policy ranks sources in project-approved funnel order.
3. Evidence ledger validates and groups `Fact`, `Inference`, and `Pending Verification`.
4. Report writer outputs sections:
   - 一句话结论
   - 项目对比
   - 可借鉴模式
   - 不建议照搬
   - Guga 落点
   - 证据
5. CLI accepts `--profile deep-research`.
6. Tests are hermetic.

## Acceptance

- Focused tests for profile, source policy, evidence ledger, report writer, and CLI profile selection.
- `pnpm --filter @guga-agent/profile-deep-research-agent test`
- `pnpm --filter @guga-agent/profile-deep-research-agent typecheck`
- `pnpm --filter @guga-agent/profile-deep-research-agent build`
- Final gates: `pnpm -r --workspace-concurrency=1 test`, `pnpm -r typecheck`, `pnpm -r build`
