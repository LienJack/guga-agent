# Memory JSONL Capability Name Constants

M35 makes JSONL memory operation names a stable exported vocabulary.

## Problem

The memory JSONL plugin now has a family of operation descriptors. Keeping those names as repeated string literals increases the chance that registration, tests, and future host callers drift apart.

## Decision

Export:

- `MEMORY_JSONL_OPERATION_NAME`
- `MEMORY_JSONL_READ_OPERATION_NAMES`
- `MEMORY_JSONL_OPERATION_NAMES`

The plugin registration code uses the same constants that package consumers can import.

## Why This Shape

- **Values stay serializable.** Constants are plain strings and readonly arrays.
- **Registration is the source of behavior.** The constants do not create new capabilities by themselves; the plugin still registers descriptors.
- **Hosts get stable names.** Consumers can avoid retyping capability ids.
- **Tests pin the vocabulary.** The test suite asserts exact constant values and descriptor registration.

## Verification

Focused tests cover the exported constant values and the runtime capability descriptors registered from them.
