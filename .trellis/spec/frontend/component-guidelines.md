# Component Guidelines

> How components are built in this project.

---

## Overview

No component framework is currently committed. Treat this file as the boundary for future Web/Desktop work: components should render typed host protocol state and dispatch typed host actions. They should not parse assistant text to infer runtime status.

---

## Component Structure

When UI packages are added, keep components small and state-driven:

- receive typed event/projection data as props;
- keep host SDK calls in adapters/hooks, not deeply inside presentational components;
- render explicit loading/error/empty states for long-running agent work;
- avoid nested card-heavy layouts for dense operational surfaces.

---

## Props Conventions

- Props should use exported host protocol/runtime types where possible.
- Prefer discriminated unions for timeline/event rows.
- Keep component props serializable unless a UI library requires callbacks.
- Callback props should be commands such as `onApprovePermission`, `onCancelRun`, or `onOpenArtifact`.

---

## Styling Patterns

No styling system exists yet. Future UI should prioritize dense, readable workbench surfaces over marketing-style sections. Agent workbench UI should make sessions, tool state, permissions, artifacts, diffs, tests, and errors scannable.

---

## Accessibility

- Permission prompts, cancel buttons, artifact links, and tool controls must be keyboard reachable.
- Long-running status should be represented with text/state, not color alone.
- Icon buttons need accessible labels or tooltips.
- Streaming output must not trap focus.

---

## Common Mistakes

- Do not infer tool progress by regexing assistant messages.
- Do not duplicate runtime state in frontend-only stores without reconciliation rules.
- Do not hide permission requests inside chat bubbles only; they are control-plane events.
- Do not build a separate frontend agent loop.
