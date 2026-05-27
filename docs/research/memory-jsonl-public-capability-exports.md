# Memory JSONL Public Capability Exports

Date: 2026-05-28

## 一句话结论

M37 should add a package-entrypoint test for memory JSONL capability constants so host-facing exports are protected, not just internal module exports.

## Evidence

- `Fact`: `packages/plugin-memory-jsonl/src/index.ts` re-exports capability name and namespace constants.
- `Fact`: Existing tests import constants from `./memory-jsonl-plugin`.
- `Fact`: Backend quality guidelines require public exports to match intended host-facing API.
- `Inference`: A direct `./index` import test is the lowest-cost way to pin the package boundary.

## Guga Landing

Add a small `public-exports.test.ts` that imports the memory JSONL constants from `./index` and asserts exact values.

## Guardrails

- Keep this module test-only for runtime behavior.
- Do not duplicate descriptor registration assertions already covered by the plugin integration test.
