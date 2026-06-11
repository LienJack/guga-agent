---
date: 2026-06-10
topic: multi-subagent-delegation-handoff-coordinator
---

# Multi Subagent Delegation and Handoff / Coordinator Boundaries Requirements

## Summary

Guga should extend the existing delegation direction into a multi-subagent capability: a parent agent can delegate several self-contained child tasks under isolated context, bounded tools, budgets, and traceable results. Handoff and coordinator mode should be defined as P2 product semantics now, but remain outside the P1 implementation scope.

---

## Problem Frame

Guga already has a narrow M14 delegation requirement that frames multi-agent support as a single `delegate_task` style child run. That is a good starting point, but it leaves ambiguity once the parent needs several independent workers for research, code inspection, review, or verification.

Reference systems split along several patterns: subagents-as-tools, handoff, coordinator, swarm, group chat, workflow graph, and remote agent protocols. Treating these as one generic "multi-agent" feature would make planning invent behavior and would risk pulling swarm/team/workflow complexity into Guga's small core too early.

The main product pressure is to get parallel useful work without losing auditability, permission boundaries, or the parent agent's responsibility for final synthesis.

---

## Actors

- A1. Parent agent: Owns the user-facing conversation, decides when to delegate, and synthesizes child results.
- A2. Child agent: Executes one bounded task with isolated conversation context and a constrained tool set.
- A3. Runtime / host: Creates child runs, enforces budgets and permissions, records events, and propagates cancellation.
- A4. Downstream planner / implementer: Uses this document to design P1 without inventing P2 swarm, handoff, or workflow behavior.
- A5. User: Receives one coherent answer or completed task outcome from the parent agent, not a raw multi-agent transcript.

---

## Key Flows

- F1. Multi-child delegation
  - **Trigger:** The parent agent identifies several independent subtasks that can run in parallel or as a bounded batch.
  - **Actors:** A1, A2, A3
  - **Steps:** The parent supplies self-contained goals and optional context for each child task; the runtime validates tool availability and delegation limits; each child runs with its own budget and trace identity; the runtime returns compact child results to the parent.
  - **Outcome:** The parent can synthesize multiple child outputs without exposing child scratch work as the user-facing conversation.
  - **Covered by:** R1, R2, R3, R4, R5, R8

- F2. Child result synthesis
  - **Trigger:** One or more child tasks complete, fail, time out, or are cancelled.
  - **Actors:** A1, A2, A3, A5
  - **Steps:** The runtime normalizes each child outcome into status, summary, usage, and trace metadata; the parent receives only model-friendly compact results; the parent decides whether to continue, retry, escalate, or answer.
  - **Outcome:** The user sees a coherent parent response, while audit data remains available outside the main conversational summary.
  - **Covered by:** R6, R7, R9, R10, R11

- F3. P2 handoff boundary
  - **Trigger:** A future profile wants a specialist agent to take over the active conversation rather than merely return a child-task result.
  - **Actors:** A1, A3, A4, A5
  - **Steps:** The profile declares handoff-capable agents; a handoff changes the active agent for the next interaction; the receiving agent owns the next response according to its instructions and tools.
  - **Outcome:** Handoff remains distinct from delegation and does not distort P1 `delegate_task` behavior.
  - **Covered by:** R12, R13, R16

- F4. P2 coordinator boundary
  - **Trigger:** A future coding or research profile wants the main thread to behave as a dispatcher across workers.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** The profile switches the parent agent into a coordinator role; the coordinator plans, delegates, receives worker notifications, and synthesizes; implementation and verification work may be delegated while the coordinator retains final responsibility.
  - **Outcome:** Coordinator mode builds on P1 delegation without requiring swarm/team state in P1.
  - **Covered by:** R14, R15, R16

---

## Requirements

**P1 multi-subagent delegation**

- R1. Provide a first-party multi-subagent delegation capability using the existing `delegate_task` direction rather than introducing a new team, workflow, or group-chat product surface.
- R2. Support delegating multiple self-contained child tasks from one parent-controlled turn or bounded batch, with a configurable maximum concurrency and deterministic behavior when the limit is exceeded.
- R3. Keep child conversation context isolated by default: each child receives only its delegated goal, optional parent-supplied context, generated child instructions, and its allowed tools.
- R4. Enforce single-layer delegation by default so child agents cannot delegate again unless a future explicit orchestrator mode enables it.
- R5. Enforce tool inheritance by least privilege: a child can only use tools that are both parent-visible and permitted for that child task, with delegation, user-clarification, memory mutation, and direct user-presentation capabilities blocked by default where applicable.
- R6. Give every child run its own budget, timeout, cancellation state, and output status so a failed or stalled child cannot consume the parent run indefinitely.
- R7. Return compact, model-friendly child results to the parent, including status and summary, without automatically injecting full child transcripts or large tool outputs into the parent context.
- R8. Preserve parent-child correlation through durable metadata and ledger-style audit records so a run can be replayed or debugged by parent run, parent tool call, child run, child session, and agent type.
- R9. Propagate parent cancellation to active children and report cancelled child outcomes deterministically.
- R10. Surface validation diagnostics before exposing the delegation tool when the child runner, allowed tools, blocked tools, or concurrency settings are invalid.
- R11. Require hermetic tests for validation, concurrency limits, isolated child inputs, permission filtering, result rendering, cancellation, timeout, and partial failure behavior; tests must not require network or real model calls.

**P2 semantic boundaries**

- R12. Define handoff as a future active-agent control transfer, not as a child-task result-return mechanism.
- R13. Preserve room for profiles to declare handoff-capable specialist agents with their own instructions, tools, and handoff descriptions without making P1 delegation depend on handoff support.
- R14. Define coordinator mode as a future profile or runtime mode where the parent agent's role is planning, delegation, worker-result interpretation, and synthesis.
- R15. Coordinator mode should be able to reuse P1 child delegation and child-result events, but should not require P1 to implement swarm teammates, mailboxes, shared task lists, or direct worker-to-worker communication.
- R16. Keep the naming and user-facing explanations distinct: delegation returns work to the parent, handoff changes who is active, and coordinator changes the parent role.

**Operational fit**

- R17. Keep the first implementation aligned with Guga's small-core strategy: delegation should be pluggable or profile-level unless core contracts are strictly required for run/session/event correlation.
- R18. Make child outputs artifact-friendly so future research or coding profiles can preserve larger child work products outside the parent message when needed.
- R19. Document scope boundaries clearly enough that future P2 planning can add handoff or coordinator mode without reinterpreting P1 as a swarm or workflow engine.

---

## Acceptance Examples

- AE1. **Covers R2, R6, R7, R8.** Given a parent delegates three independent research subtasks with a concurrency limit of two, when the delegation runs, at most two children execute at once, each child gets its own run identity and budget, and the parent receives three compact outcomes once the batch settles.
- AE2. **Covers R3, R5.** Given a child task is allowed only read-oriented tools, when the child starts, it cannot see the parent's full transcript and cannot call tools outside the parent-visible allowlist or default blocked set.
- AE3. **Covers R4, R10.** Given a child tool allowlist includes `delegate_task`, when the delegation tool is built or validated, the runtime rejects or removes recursive delegation according to the configured default and emits a diagnostic.
- AE4. **Covers R9.** Given two children are active, when the parent run is cancelled, both children receive cancellation and the parent receives deterministic cancelled outcomes instead of hanging.
- AE5. **Covers R12, R16.** Given a future profile wants a code-review specialist to answer the user directly, when it uses handoff, the active agent changes; this is not represented as a P1 child result summary.
- AE6. **Covers R14, R15.** Given a future coordinator profile is enabled, when it enters a large coding task, it can delegate research and verification workers through the P1 primitive while retaining final synthesis itself.

---

## Success Criteria

- A downstream planner can implement P1 without deciding whether Guga is building handoff, swarm, workflow graph, or remote agent interoperability.
- A parent agent can safely run multiple child tasks and synthesize their results while preserving context isolation, permission inheritance, budget limits, and traceability.
- Failed, timed-out, or cancelled children produce deterministic parent-visible outcomes and audit records.
- The P2 semantics for handoff and coordinator are clear enough that future work can extend the model without breaking P1 delegation.
- The resulting design remains consistent with Guga's strategy of a small core with plugin/profile/toolset capabilities.

---

## Scope Boundaries

- P1 does not implement handoff or active-agent switching.
- P1 does not implement coordinator mode as a runtime/profile mode.
- P1 does not implement swarm teammates, team files, mailboxes, shared task lists, or worker-to-worker messaging.
- P1 does not implement unrestricted group chat or shared-context multi-agent conversations.
- P1 does not introduce a workflow graph runtime or make external graph frameworks part of core.
- P1 does not implement remote A2A adapters or remote agent discovery.
- P1 does not implement automatic worktree management.
- P1 does not expose child scratch transcripts as the default parent-visible result.
- P1 does not allow recursive delegation by default.

---

## Key Decisions

- Choose subagents-as-tools for P1: This keeps the parent agent in control and matches the narrow multi-agent substrate already started by M14.
- Treat "multi" as bounded child-run concurrency, not free-form collaboration: Guga gets parallel work without inheriting swarm state surfaces.
- Keep context isolated by default: This protects context budget, makes child prompts self-contained, and improves replayability.
- Make events and ledger data first-class acceptance criteria: Multi-agent behavior that cannot be audited or replayed is not acceptable for Guga's permission and runtime model.
- Define handoff and coordinator now, implement later: Naming and semantic separation prevents P1 API choices from blocking P2.
- Defer swarm and workflow graph: They are legitimate later patterns, but they carry separate state, routing, UI, and recovery requirements.

---

## Dependencies / Assumptions

- Existing M14 delegation work remains the baseline to evolve rather than discard.
- The child runner can be injected or hosted by the runtime/profile so unit tests can use fakes.
- The parent agent remains responsible for final user-facing synthesis in P1.
- P1 may require minimal shared contracts for run/session/event correlation, but should avoid moving orchestration policy into core.
- Larger child artifacts should be referenced or stored outside the compact parent result when needed; exact artifact mechanics are deferred to planning.

---

## Evidence

- `docs/brainstorms/2026-05-28-m14-multi-agent-delegation-requirements.md` established the existing narrow `delegate_task` direction.
- `docs/research/context-packs/multi-agent.md` compares Claude Code, Hermes, DeerFlow, OpenCode, and DeepAgentsJS, and recommends single-layer delegation, context isolation, bounded concurrency, trace propagation, and tool inheritance.
- `docs/research/current-multi-agent-collaboration-2026.md` compares current multi-agent frameworks and separates P1 delegation from P2 handoff/coordinator and P3 workflow/A2A.
- `docs/research/source-analysis/claude-code-analysis/analysis/04h-multi-agent.md` shows Claude Code has separate subagent, coordinator, and swarm layers rather than one generic multi-agent primitive.
- `docs/research/source-analysis/deerflow-book/chapters/08-subagent-overview.md` supports single-layer lead-to-subagent delegation with isolated child context and bounded concurrency.
- `docs/research/source-analysis/hermes-wiki/concepts/multi-agent-architecture.md` supports `delegate_task` style child isolation, blocked recursive tools, bounded concurrency, and cancellation propagation.
- Anthropic's multi-agent research and context-engineering articles support clean subagent contexts, compact summaries, and artifact references for large child outputs.
- LangChain and OpenAI Agents documentation distinguish subagents / agents-as-tools from handoff, matching the P1 / P2 semantic split in this document.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R6][Technical] What default concurrency, child turn budget, and timeout values best match Guga's current runtime and provider limits?
- [Affects R5][Technical] Which tool capabilities belong in the default blocked set for child agents across coding, research, and computer-use profiles?
- [Affects R8][Technical] Which existing event and session contracts should carry parent-child correlation, and which new event types are strictly necessary?
- [Affects R18][Technical] What artifact mechanism should store larger child outputs without bloating the parent context?
