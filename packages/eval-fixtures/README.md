# @guga-agent/eval-fixtures

Hermetic cross-module eval fixtures for the Guga roadmap.

The package collects small mock-provider fixtures that map to roadmap risks and module ownership. It is a seed regression suite, not a benchmark platform.

```ts
import { flywheelEvalFixtures } from "@guga-agent/eval-fixtures";
import { runEvalSuite } from "@guga-agent/plugin-eval-runner";

const result = await runEvalSuite([...flywheelEvalFixtures]);
```

Each fixture includes metadata for category, module, layer, covered risk, and tags so failures can be routed to the right subsystem.
