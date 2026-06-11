# Flywheel Eval Fixtures

`@guga-agent/eval-fixtures` is the first cross-module eval registry for Guga.

It is intentionally small. The package is a seed regression suite that proves each major product surface has at least one hermetic fixture wired through the existing eval runner.

## Categories

| Category | Module | Layer | Covered risk |
| --- | --- | --- | --- |
| `capability-discovery` | M6 | tool | Skills and MCP capabilities remain explainable as namespaced registered capabilities. |
| `tool-action` | M6 | tool / permission | Tool metadata, expected tool calls, forbidden unsafe calls, intent metadata, and audit events stay regression-tested. |
| `host-protocol` | M7/M11 | protocol | Hosts observe typed sessions, runs, events, permissions, artifacts, and final status. |
| `production-ops` | M8 | provider | Operations expose health, audit, metrics, and eval diagnostics without credentials. |
| `code-agent` | M9 | profile | Code agent behavior stays profile-owned instead of leaking into core. |
| `deep-research` | M10 | profile | Research output preserves source policy, evidence strength, and report structure. |

## Tool-Action Fixtures

`tool-action` fixtures use local mock tools and mock provider responses. They can assert:

- expected tool calls through `expected.toolCalls`;
- forbidden tool calls through `expected.forbiddenToolCalls`;
- lifecycle or intent metadata through `expected.eventMetadata`;
- ordinary final-answer and event-type expectations through the existing fields.

These checks are regression gates for the Action OS boundary. They prove that a fixture can catch an unsafe or incorrect tool selection without calling real backends, remote services, credentials, or model benchmark infrastructure.

## Usage

```ts
import { flywheelEvalFixtures } from "@guga-agent/eval-fixtures";
import { runEvalSuite } from "@guga-agent/plugin-eval-runner";

const result = await runEvalSuite([...flywheelEvalFixtures]);
```

## Gates

```bash
pnpm --filter @guga-agent/eval-fixtures test
pnpm --filter @guga-agent/eval-fixtures typecheck
pnpm --filter @guga-agent/eval-fixtures build
```

## Boundary

These fixtures are not benchmarks. They are local smoke/regression cases that keep the roadmap surfaces runnable without network access, credentials, or private session data. Tool-action fixtures are deterministic mock-response checks; they do not measure model precision or recall.
