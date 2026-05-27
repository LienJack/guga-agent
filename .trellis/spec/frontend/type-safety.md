# Type Safety

> Type safety patterns in this project.

---

## Overview

Frontend-facing TypeScript should reuse host protocol types instead of inventing parallel UI-only shapes. Protocol changes should be made at the contract layer first and then consumed by UI packages.

---

## Type Organization

- Shared host types live in `packages/host-protocol`.
- Runtime adapter types live in host/runtime packages.
- UI-only view models should be named clearly and derived from protocol types.
- Avoid exporting component-private types unless another package needs them.

---

## Validation

No runtime validation library is selected for frontend packages. Host/server boundaries should validate incoming commands and event payloads before they affect runtime state. UI code should treat unknown event types as non-fatal and render an unsupported-event fallback.

---

## Common Patterns

- Prefer discriminated unions for event rows and command results.
- Use exhaustive switches for protocol event rendering.
- Keep SDK result types explicit: success and failure should both be modeled.
- Use `readonly` arrays/objects for projection data where practical.

---

## Forbidden Patterns

- Do not use `any` for host events, permission payloads, or artifact metadata.
- Do not cast unknown protocol data to a concrete event type without validation or narrowing.
- Do not duplicate core/runtime contract types inside UI packages.
- Do not encode control state only in display strings.
