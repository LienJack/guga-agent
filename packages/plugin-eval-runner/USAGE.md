# @guga-agent/plugin-eval-runner Usage

## Purpose

`@guga-agent/plugin-eval-runner` runs hermetic local eval fixtures against Guga runtimes. Fixtures use mock provider responses and expected outcomes, so they do not require provider credentials.

## Import

```ts
import {
  createEvalRunnerPlugin,
  passingMockFixture,
  runEvalFixture,
  runEvalSuite
} from "@guga-agent/plugin-eval-runner";
```

## Main APIs

- `runEvalFixture(fixture, options)`: runs one fixture and returns structured diagnostics.
- `runEvalSuite(fixtures, options)`: runs multiple fixtures and aggregates results.
- `passingMockFixture` and `failingMockFixture`: small example fixtures.
- `createEvalRunnerPlugin(options)`: registers a discoverable `eval.run` operation.
- Types: `EvalExpectation`, `EvalFixture`, `EvalResult`, `EvalRunnerOptions`, `EvalSuiteResult`, and `EvalRunnerPluginOptions`.

## Common Usage

```ts
const result = await runEvalSuite([passingMockFixture]);

if (!result.ok) {
  console.error(result.failures);
}
```

Install the plugin when a runtime should advertise eval support:

```ts
const runtime = createAgentRuntime({
  plugins: [createEvalRunnerPlugin()]
});
```

## Notes

- `createEvalRunnerPlugin()` does not execute evals. Actual execution uses the exported runner helpers.
- `failingMockFixture` is intentionally useful as a failure-path fixture.
- The package is for seed regression checks, not benchmark scoring.

## Related Packages

- `@guga-agent/core` supplies runtime and mock provider contracts.
- `@guga-agent/eval-fixtures` provides roadmap-aligned fixture collections.
