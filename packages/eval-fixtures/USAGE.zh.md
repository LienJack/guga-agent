# @guga-agent/eval-fixtures 用法

## 用途

`@guga-agent/eval-fixtures` 为 Guga 提供与路线图对齐的 hermetic eval fixtures。它是种子回归套件，不是基准测试平台。

## 导入

```ts
import {
  createFlywheelEvalManifest,
  flywheelEvalFixtures,
  getFlywheelFixturesByCategory,
  validateFlywheelEvalFixtures
} from "@guga-agent/eval-fixtures";
```

## 主要 API

- `flywheelEvalFixtures`：用于路线图飞轮覆盖的 fixture 集合。
- `createFlywheelEvalManifest(fixtures)`：构建按元数据分组的 manifest。
- `getFlywheelFixturesByCategory(fixtures, category)`：按类别过滤 fixtures。
- `validateFlywheelEvalFixtures(fixtures)`：验证 fixture 元数据和结构。
- 类型：`EvalFixtureCategory`、`EvalFixtureLayer`、`FlywheelEvalFixture`、`FlywheelEvalManifest` 和 `FlywheelEvalManifestCategory`。

## 常见用法

```ts
import { flywheelEvalFixtures } from "@guga-agent/eval-fixtures";
import { runEvalSuite } from "@guga-agent/plugin-eval-runner";

const result = await runEvalSuite([...flywheelEvalFixtures]);
```

## 参数说明

- `flywheelEvalFixtures` 是只读 fixture 集合，元素满足 `FlywheelEvalFixture`。每个 fixture 继承 `EvalFixture`，并增加 `module`、`category`、`layer`、`covers` 和 `tags` 元数据；`runId` 必须稳定，便于回归对比。
- `getFlywheelFixturesByCategory(fixtures, category)` 的 `fixtures` 是 `readonly FlywheelEvalFixture[]`，`category` 必须是 `EvalFixtureCategory` 之一：`"capability-discovery"`、`"host-protocol"`、`"production-ops"`、`"code-agent"` 或 `"deep-research"`。
- `createFlywheelEvalManifest(fixtures)` 接收 fixture 列表并返回 `FlywheelEvalManifest`，包含 `fixtureCount`、按固定 category 顺序生成的 `categories`，以及去重排序后的 `modules`。
- `validateFlywheelEvalFixtures(fixtures)` 检查重复 id、空 `tags`、空 `covers`、缺少稳定 `runId`，以及每个 `EvalFixtureCategory` 是否至少有一个 fixture；返回字符串诊断数组，空数组表示通过。
- `FlywheelEvalFixture.module` 目前限定为 `"M6"`、`"M7/M11"`、`"M8"`、`"M9"` 或 `"M10"`；`layer` 使用 `EvalFixtureLayer`，可为 provider、tool、context、permission、session、protocol 或 profile。

## 注意事项

- Fixtures 包含类别、模块、层级、覆盖风险和标签的元数据。
- 该包依赖 eval runner 包执行。
- 保持 fixtures 小巧且 hermetic，使其无需 provider 凭据即可运行。

## 相关包

- `@guga-agent/plugin-eval-runner` 执行这些 fixtures。
- `@guga-agent/core` 提供 eval 使用的运行时契约。
