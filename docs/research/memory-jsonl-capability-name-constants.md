# Memory JSONL Capability Name Constants

Date: 2026-05-28

## 一句话结论

M35 should export the JSONL memory operation names as constants so plugin registration, tests, and host callers share one stable vocabulary.

## Evidence

- `Fact`: M28-M34 expanded `createMemoryJsonlPlugin()` from one broad descriptor to a family of read/write and read-only projection descriptors.
- `Fact`: Descriptor names are currently duplicated in registration and tests.
- `Fact`: Capability descriptor guidelines emphasize serializable, stable capability names.
- `Inference`: Exported constants reduce drift while preserving additive descriptor behavior.

## Guga Landing

Add exported constants for the storage descriptor and read-only projection descriptors, use them in plugin registration, and re-export them from the package index.

## Guardrails

- Keep values unchanged.
- Keep descriptor-only scope.
- Do not make trust descriptors public unless a host needs them later.
