# Build Agent From Zero: M35 Memory JSONL Capability Name Constants

M35 is about naming discipline.

## Strings Become Infrastructure

At first, a capability name feels small:

`memory.jsonl`

Then the plugin grows:

- `memory.jsonl.review`
- `memory.jsonl.review_report`
- `memory.jsonl.review_markdown`
- `memory.jsonl.health`
- `memory.jsonl.audit_snapshot`
- `memory.jsonl.retrieval`
- `memory.jsonl.curated_markdown`

At that point, names are no longer casual strings.

They are product contracts.

## The Exported Vocabulary

M35 adds exported constants:

- `MEMORY_JSONL_OPERATION_NAME`
- `MEMORY_JSONL_READ_OPERATION_NAMES`
- `MEMORY_JSONL_OPERATION_NAMES`

The plugin uses them for registration.

Tests use them for registration checks.

Host code can use them later for discovery checks.

## Why Not Export Everything

The module does not export trust descriptors.

It does not export registration helpers.

It does not add execution handlers.

The useful stable surface is the name vocabulary. Trust and behavior still belong to the plugin registration path.

## The Pattern

When a capability family becomes stable, name it in code.

Keep the constants boring.

Pin exact values in tests.

Use them where capabilities are registered.

That is enough to turn strings into a reliable contract without turning a small plugin into a framework.
