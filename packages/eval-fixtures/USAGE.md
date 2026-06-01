# @guga-agent/eval-fixtures Usage

## Purpose

`@guga-agent/eval-fixtures` provides hermetic roadmap-aligned eval fixtures for Guga. It is a seed regression suite, not a benchmark platform.

## Import

```ts
import {
  createFlywheelEvalManifest,
  flywheelEvalFixtures,
  getFlywheelFixturesByCategory,
  validateFlywheelEvalFixtures
} from "@guga-agent/eval-fixtures";
```

## Main APIs

- `flywheelEvalFixtures`: fixture collection for roadmap flywheel coverage.
- `createFlywheelEvalManifest(fixtures)`: builds a manifest grouped by metadata.
- `getFlywheelFixturesByCategory(fixtures, category)`: filters fixtures by category.
- `validateFlywheelEvalFixtures(fixtures)`: validates fixture metadata and structure.
- Types: `EvalFixtureCategory`, `EvalFixtureLayer`, `FlywheelEvalFixture`, `FlywheelEvalManifest`, and `FlywheelEvalManifestCategory`.

## Common Usage

```ts
import { flywheelEvalFixtures } from "@guga-agent/eval-fixtures";
import { runEvalSuite } from "@guga-agent/plugin-eval-runner";

const result = await runEvalSuite([...flywheelEvalFixtures]);
```

## Parameters

- `flywheelEvalFixtures` is a readonly collection of `FlywheelEvalFixture` entries. Each fixture includes the base eval fields from `@guga-agent/plugin-eval-runner`, including `id`, `input`, `mockResponses`, optional provider/model/run controls, and optional expectations.
- `FlywheelEvalFixture` adds required roadmap metadata: `module`, `category`, `layer`, `covers`, and `tags`. `tags` must contain at least one entry, `covers` must describe the covered risk, and fixtures should include a stable `runId`.
- `createFlywheelEvalManifest(fixtures)` requires an array of flywheel fixtures and returns counts grouped by category plus the covered modules.
- `getFlywheelFixturesByCategory(fixtures, category)` requires a fixture array and one category value, such as `"code-agent"` or `"deep-research"`.
- `validateFlywheelEvalFixtures(fixtures)` returns string diagnostics for duplicate ids, missing tags, empty risk coverage, missing stable run ids, and missing category coverage.

## Notes

- Fixtures include metadata for category, module, layer, covered risk, and tags.
- The package depends on the eval runner package for execution.
- Keep fixtures small and hermetic so they can run without provider credentials.

## Related Packages

- `@guga-agent/plugin-eval-runner` executes the fixtures.
- `@guga-agent/core` provides runtime contracts used by evals.
