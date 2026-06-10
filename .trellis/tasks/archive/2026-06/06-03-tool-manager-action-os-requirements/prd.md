# Tool Manager Action OS Requirements

## Summary

Write a requirements supplement that upgrades Guga's tool runtime framing from a plugin execution pipeline to an Action Operating System: tools are governed action capabilities with intent, permission, credential, sandbox, evidence, context projection, audit, and eval semantics.

## Artifact

- Main requirements document: `docs/brainstorms/2026-06-03-tool-manager-action-os-requirements.md`

## Scope

- Preserve the existing M3 tool runtime requirements as the baseline.
- Add scope-level requirements for ToolView / capability lease, ToolIntent, canonical descriptors, action/effect taxonomy, credential/sandbox governance, result evidence boundaries, multi-source capability ontology, and tool metadata eval.
- Keep implementation details for `ce-plan`.

## Non-goals

- No code changes in this task.
- No enterprise policy engine, remote sandbox product, credential broker product, or UI implementation.
- No new source-code-level research pass across reference projects.
