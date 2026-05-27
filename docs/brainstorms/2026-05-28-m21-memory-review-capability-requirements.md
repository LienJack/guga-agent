# M21 Memory Review Capability Requirements

Date: 2026-05-28

## Problem

M20 added a memory audit report, but hosts cannot yet discover that review surface through the same capability descriptor path used by candidates and governance.

## Requirements

- Add a first-party plugin factory.
- Register `memory.review` as a plugin-owned operation descriptor.
- Keep the trust scope read-only.
- Test descriptor discovery through the runtime capability list.

## Non-Goals

- Do not add a callable tool.
- Do not mutate memory records.
- Do not couple the report to JSONL storage.
