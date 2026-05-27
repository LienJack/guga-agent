# Build Agent From Zero: M37 Memory JSONL Public Capability Exports

M37 is about proving the door is actually open.

## Internal Exports Are Not Enough

M35 created capability-name constants.

M36 added a namespace constant.

The plugin tests imported those constants from the internal module:

`./memory-jsonl-plugin`

That proves the constants exist.

It does not prove hosts can import them from the package entrypoint.

## The Entrypoint Test

M37 adds a small test that imports from:

`./index`

and verifies the exact exported values.

This is not glamorous work, but it protects the API promise:

If host code is supposed to import a constant, the package entrypoint should be tested directly.

## Why Keep It Separate

The descriptor registration test still checks runtime behavior.

The public export test checks package shape.

Those are different contracts, and separating them makes failures easier to read.

## The Pattern

When a symbol becomes host-facing:

- export it from the package entrypoint;
- test the entrypoint;
- keep behavior tests focused on behavior.

M37 applies that rule to memory JSONL capability constants.
