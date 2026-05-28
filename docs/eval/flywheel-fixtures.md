# Flywheel Eval Fixtures

`@guga-agent/eval-fixtures` is the first cross-module eval registry for Guga.

It is intentionally small. The package is a seed regression suite that proves each major product surface has at least one hermetic fixture wired through the existing eval runner.

## Categories

| Category | Module | Layer | Covered risk |
| --- | --- | --- | --- |
| `capability-discovery` | M6 | tool | Skills and MCP capabilities remain explainable as namespaced registered capabilities. |
| `host-protocol` | M7/M11 | protocol | Hosts observe typed sessions, runs, events, permissions, artifacts, and final status. |
| `production-ops` | M8 | provider | Operations expose health, audit, metrics, and eval diagnostics without credentials. |
| `code-agent` | M9 | profile | Code agent behavior stays profile-owned instead of leaking into core. |
| `deep-research` | M10 | profile | Research output preserves source policy, evidence strength, and report structure. |

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

These fixtures are not benchmarks. They are local smoke/regression cases that keep the roadmap surfaces runnable without network access, credentials, or private session data.
