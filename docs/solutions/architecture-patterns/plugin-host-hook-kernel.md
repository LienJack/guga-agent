# Plugin Host And Hook Kernel

M1 lets capabilities enter Guga from local plugins without turning core into a list of first-party special cases.

## Problem

After M0, providers and tools can run, but the host still has to register them manually. That does not scale into a plugin ecosystem. Hooks also cannot be simple event listeners because some hooks must affect behavior before side effects happen.

## Decision

Add two core concepts:

- `PluginHost` for trusted local plugin lifecycle and capability registration.
- `HookKernel` for deterministic control points such as pre-tool gates.

Plugins receive a constrained `PluginContext` and can register providers, tools, and hooks through public runtime surfaces.

## Why This Shape

- **Plugins contribute; core consumes.** A plugin can add capability, but core still owns execution semantics.
- **Hooks are not events.** Events describe facts that already happened; hooks can make gate decisions before behavior changes.
- **Lifecycle is explicit.** Init, capability registration, hook decisions, hook failures, and shutdown are observable.
- **M0 behavior remains intact.** A runtime without plugins still follows the original core path.
- **Marketplace complexity is deferred.** M1 proves local trusted plugins before dynamic loading, signatures, or sandboxing.

## Current Limits

- No plugin manifest or discovery.
- No hot reload.
- No marketplace trust model.
- No namespace governance beyond existing fail-fast behavior.
- No real provider/tool packages.

## Verification

M1 is protected by tests for plugin-provided provider/tool runs, pre-tool denial, plugin lifecycle events, hook failure handling, and shutdown cleanup.
