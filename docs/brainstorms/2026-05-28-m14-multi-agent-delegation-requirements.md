# M14 Multi-Agent Delegation Requirements

Date: 2026-05-28

## Goal

Ship the first multi-agent substrate for Guga as a narrow, testable `delegateTask` capability. The feature should let a parent agent delegate one self-contained task to an isolated child run and receive a compact result, without introducing swarm, handoff, group chat, or a workflow engine.

## Product Boundary

M14 is a runtime/profile building block, not a user-facing team product. It must be useful to future code, research, and review agents, but it should stay small enough to audit and replay.

## Requirements

- Provide a first-party delegation package that can create a `delegateTask` tool definition.
- Keep child context isolated: the child receives only `goal`, optional `context`, and generated child instructions.
- Enforce single-layer delegation by default so a child toolset cannot include `delegateTask`.
- Enforce tool inheritance by allowlist: child tools are selected from a provided parent-visible tool catalog and cannot invent new tools.
- Carry parent/child correlation in structured metadata and a compact ledger.
- Render a deterministic, model-friendly result summary for the parent agent.
- Provide validation diagnostics before a delegation tool is exposed.
- Keep the implementation outside `packages/core` unless exported contracts are strictly necessary.
- Add hermetic unit tests; no network or real model calls.

## Non-Goals

- No team/swarm runtime.
- No handoff that changes the active agent for the next turn.
- No background task queue.
- No remote A2A adapter.
- No desktop UI.
- No automatic worktree management.

## Acceptance

- A child runner can be injected in tests and receives self-contained `input`, `maxTurns`, `timeoutMs`, `agentType`, and `tools`.
- The delegate tool rejects invalid inputs and unavailable allowlisted tools.
- Delegation metadata includes `parentRunId`, `parentToolCallId`, `childRunId`, `childSessionId`, `agentType`, and output status.
- The package builds, typechecks, and passes tests.
- M14 has a research note, plan, solution note, and article.
