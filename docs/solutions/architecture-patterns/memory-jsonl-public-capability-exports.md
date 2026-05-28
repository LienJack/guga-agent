# Memory JSONL Public Capability Exports

M37 protects the host-facing export surface for memory JSONL capability constants.

## Problem

M35 and M36 added operation-name and namespace constants, but the tests imported them from the internal plugin module. That did not prove the package entrypoint exported the constants for host callers.

## Decision

Add `public-exports.test.ts` importing capability constants from `./index`.

The test pins:

- `MEMORY_JSONL_OPERATION_NAME`;
- `MEMORY_JSONL_OPERATION_NAMESPACE`;
- `MEMORY_JSONL_READ_OPERATION_NAMES`;
- `MEMORY_JSONL_OPERATION_NAMES`.

## Why This Shape

- **Host boundary is tested.** The package entrypoint is now covered directly.
- **Runtime behavior stays untouched.** Descriptor registration tests remain separate.
- **Low maintenance.** Exact value assertions make accidental export drift obvious.

## Verification

Focused package tests now include the public entrypoint export test, raising the memory JSONL package suite to 13 tests.
