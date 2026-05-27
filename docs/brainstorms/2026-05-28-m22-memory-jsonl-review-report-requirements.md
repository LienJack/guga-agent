# M22 Memory JSONL Review Report Requirements

Date: 2026-05-28

## Problem

The review report exists at the governed-ledger layer, but durable JSONL memory users still need to manually reopen records, project governance, and then build the report.

## Requirements

- Add one convenience read method on `JsonlMemoryStore`.
- Preserve the same corruption and partial-tail semantics as `readRecords()`.
- Return typed JSONL diagnostics separately from governance report diagnostics.
- Do not add writes, repair, import, or prompt-context behavior.

## Non-Goals

- No automatic decision making.
- No new plugin capability descriptor.
- No UI or CLI.
