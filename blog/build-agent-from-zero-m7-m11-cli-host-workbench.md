# 从零构建 Agent：M7/M11 CLI、Host Protocol 与工作台地基

M7 和 M11 我把它们合在一起做第一刀，因为它们其实是同一个问题的两面：

- M7 想要一个真正能跑的 CLI；
- M11 想要桌面/Web 工作台；
- 两者都不能各自绕过 runtime，自己发明一套状态和事件。

所以这一轮没有先做漂亮 UI，也没有先把 CLI 写成一个直接调用 core 的小脚本。先做的是一层稳定的 host protocol。

## 为什么不是直接做 CLI

最短路径当然是：

```ts
await runtime.run({ input })
console.log(result.finalAnswer)
```

这能跑，但它会立刻把后路堵住。

CLI 需要展示 tool 进度、debug event、permission、usage。桌面和 Web 也需要这些。后面 code-agent、deep-research、artifact viewer、resume/fork 都还会继续要这些。

如果 CLI 自己解析 `AgentEvent`，Web 再解析一遍，桌面再写一遍，Guga 很快会出现三套“什么叫一次 run”的定义。

M7/M11 的核心判断是：

> core 负责执行事实；host protocol 负责产品面事实；CLI/Web/desktop 都只消费 host protocol。

## 这次落下的包

这一轮新增了五个包。

`@guga-agent/host-protocol` 定义公共 DTO：

- `HostEvent`
- `SessionResource`
- `RunResource`
- `CapabilityResource`
- SSE envelope

`@guga-agent/host-runtime` 包装 core runtime：

- 创建 session/run；
- 把 core `AgentEvent` 投影为 `HostEvent`；
- 维护第一版内存 run store；
- 暴露 M6 capability descriptors；
- 提供 host 层 cancel 控制。

`@guga-agent/host-local-server` 提供本地 HTTP/SSE：

- `POST /sessions`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `POST /runs/:runId/cancel`
- `GET /capabilities`

`@guga-agent/host-sdk` 是 typed client：

- JSON API client；
- SSE async iterable；
- local server launcher；
- typed host errors。

`@guga-agent/cli` 提供第一条产品入口：

```bash
guga run "hello" --mock --debug-events
```

它输出的是 host event，而不是 CLI 自己编的一套日志。

## 最重要的设计点

### 1. Run 是资源，SSE 是投影

SSE 很适合看实时事件，但它不应该是唯一状态来源。

这一版里，每个 run 都有 `RunResource`，事件也会缓存在 host runtime 里。客户端断开 SSE 后，可以重新 `GET /runs/:runId/events` 读回来。

这让 Web/desktop 以后能做刷新、重连、历史查看，而不是把“页面没开着”理解成“事件不存在”。

### 2. CLI 不拥有协议

CLI 通过 SDK 调 host。

这看起来比直接调用 core 多了一层，但换来的好处很大：CLI 的事件渲染、SDK 的 SSE parser、本地 server 的路由，都在同一个协议上工作。

以后桌面版要看同一条 event stream，不需要问 CLI 内部怎么打印；它只需要消费 `HostEvent`。

### 3. M6 的 capability discovery 开始有产品面

M6 做了 capability descriptor 和 diff。M7/M11 把它挂到了 host 层：

```http
GET /capabilities
```

这意味着 CLI/desktop/Web 可以展示 runtime 当前工具、skills、MCP server、hooks、stores，而不是猜插件初始化日志。

### 4. 先保守处理同步 run

这一版 HTTP `POST /runs` 仍然等待 run 完成后返回。SSE endpoint 可以 replay 已缓冲事件。

这不是最终形态。最终应该是 POST 创建 run 后立即返回，run 在后台执行，SSE 实时追事件。但第一版先把协议、资源、测试和客户端边界立稳，避免同时改 core 调度模型。

## 这次故意没做什么

没有做完整桌面工作台。

没有做 Web UI。

没有做 OpenAPI 生成 SDK。

没有做 durable SSE resume。

没有做完整 permission approval API。

这些都重要，但它们都应该站在 host protocol 之后，而不是抢在 host protocol 之前定义事实。

## 验证

这一轮的测试覆盖了几条关键链路：

- protocol event sequencing；
- core event 到 host event 的投影；
- local server 真实端口上的 session/run/SSE；
- SDK client、SSE parser、server launcher；
- CLI `run --mock` 和 `--debug-events`；
- host runtime cancel。

还实际跑过：

```bash
node packages/cli/dist/index.js run hello --mock --debug-events
```

它能打印结构化 `HostEvent`，最后输出：

```text
mock: hello
```

## 这一轮之后

Guga 现在有了第一条从 core 到产品面的稳定路径：

```text
core AgentRuntime
  -> host-runtime projection
  -> host-protocol DTO
  -> local HTTP/SSE
  -> SDK
  -> CLI
```

后面的桌面/Web 工作台、AG-UI adapter、ACP adapter、artifact viewer、permission panel，都应该沿着这条线继续长，而不是从 core 旁边另起炉灶。
