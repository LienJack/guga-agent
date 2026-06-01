# @guga-agent/plugin-eval-runner 用法

## 用途

`@guga-agent/plugin-eval-runner` 针对 Guga 运行时运行 hermetic 本地 eval fixture。Fixture 使用 mock provider response 和预期结果，因此不需要 provider 凭据。

## 导入

```ts
import {
  createEvalRunnerPlugin,
  passingMockFixture,
  runEvalFixture,
  runEvalSuite
} from "@guga-agent/plugin-eval-runner";
```

## 主要 API

- `runEvalFixture(fixture, options)`: 运行单个 fixture 并返回结构化诊断。
- `runEvalSuite(fixtures, options)`: 运行多个 fixture 并聚合结果。
- `passingMockFixture` 和 `failingMockFixture`: 小型示例 fixture。
- `createEvalRunnerPlugin(options)`: 注册可发现的 `eval.run` 操作。
- 类型：`EvalExpectation`、`EvalFixture`、`EvalResult`、`EvalRunnerOptions`、`EvalSuiteResult` 和 `EvalRunnerPluginOptions`。

## 常见用法

```ts
const result = await runEvalSuite([passingMockFixture]);

if (!result.ok) {
  console.error(result.failures);
}
```

当某个运行时需要声明 eval 支持时，安装该插件：

```ts
const runtime = createAgentRuntime({
  plugins: [createEvalRunnerPlugin()]
});
```

## 参数说明

- `runEvalFixture(fixture, options)` 的 `fixture` 使用 `EvalFixture`。`id`、`input` 和 `mockResponses` 为必填字段；`name`、`providerId`、`modelId`、`runId`、`maxTurns` 和 `expected` 可选，用于命名、选择 provider/model、固定 run id、限制 turn 数以及声明预期结果。
- `EvalFixture.expected` 使用 `EvalExpectation`。`ok`、`finalAnswer`、`finalAnswerIncludes`、`errorCode` 和 `eventTypes` 均为可选字段，用于检查运行状态、最终回答、错误码和事件序列。
- `runEvalSuite(fixtures, options)` 接收 `EvalFixture[]`；`options` 使用 `EvalRunnerOptions`，其中 `runtime` 可选，用于传入 `AgentRuntimeOptions` 并影响 fixture 创建的运行时。
- `createEvalRunnerPlugin(options)` 使用 `EvalRunnerPluginOptions`。`pluginId` 可选；该 factory 只注册 `eval.run` operation descriptor，不接收 fixture。

## 注意事项

- `createEvalRunnerPlugin()` 不会执行 eval。实际执行使用导出的 runner helper。
- `failingMockFixture` 有意用于 failure-path fixture。
- 该包用于种子回归检查，而不是 benchmark scoring。

## 相关包

- `@guga-agent/core` 提供运行时和 mock provider 契约。
- `@guga-agent/eval-fixtures` 提供与路线图对齐的 fixture 集合。
