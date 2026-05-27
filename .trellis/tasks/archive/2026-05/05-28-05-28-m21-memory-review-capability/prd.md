# M21 Memory Review Capability

## Goal

Expose the M20 memory review report as a first-party capability descriptor so hosts can discover the audit surface.

## Requirements

- Add `createMemoryReviewPlugin()` to `@guga-agent/plugin-memory-candidates`.
- Register an operation descriptor named `memory.review`.
- Preserve first-party trust and memory read-only scope.
- Export the plugin factory from the package public API.
- Add behavior coverage proving descriptor registration and ownership metadata.

## Out of Scope

- No executable memory review tool implementation.
- No automatic review decisions.
- No file writes, JSONL writes, or prompt injection.

## Acceptance

- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
