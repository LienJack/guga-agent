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

## Parameters

- `runEvalFixture(fixture, options)` requires a fixture with `id`, `input`, and `mockResponses`. Optional fixture fields include `name`, `providerId`, `modelId`, `runId`, `maxTurns`, and `expected`; omit `expected` to require a successful run by default.
- `expected` can assert `ok`, exact `finalAnswer`, `finalAnswerIncludes`, `errorCode`, and emitted `eventTypes`.
- `options.runtime` is optional and is passed to `createAgentRuntime()` before the mock provider is registered.
- `runEvalSuite(fixtures, options)` requires an array of fixtures and reuses the same optional runtime options for each fixture.
- `createEvalRunnerPlugin(options)` accepts optional `pluginId`; omit it to register the default `eval-runner` operation plugin.

## Notes

- `createEvalRunnerPlugin()` does not execute evals. Actual execution uses the exported runner helpers.
- `failingMockFixture` is intentionally useful as a failure-path fixture.
- The package is for seed regression checks, not benchmark scoring.

## Related Packages

- `@guga-agent/core` supplies runtime and mock provider contracts.
- `@guga-agent/eval-fixtures` provides roadmap-aligned fixture collections.
