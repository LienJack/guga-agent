# @guga-agent/cli 用法

## 用途

`@guga-agent/cli` 提供面向最终用户的 `guga` 命令。它支持交互式 Ink workbench、headless runs、provider login/auth/config、model listing，以及基于 local host 的执行。

此包是 CLI 入口点，不是可复用的 library API。导入包根入口会执行 CLI 顶层入口。

## 本地开发安装

从仓库根目录：

```sh
pnpm dev:cli --install
source ~/.zshrc
guga
```

包的 `bin` 将 `guga` 映射到 `./dist/index.js`。

## 导入

不要将此包作为 library 导入。包根入口是可执行入口点，会运行 CLI 顶层代码。

```sh
guga --help
```

## 主要 API

- CLI binary：`guga`。
- Internal executable entry：`src/index.ts`。
- Internal command dispatcher：`commands/run.ts` 中的 `runCli(argv, io)`，由 tests 和 binary 使用。
- Workbench internals：`ink-workbench/` 下的 Ink UI、`tui/` 下的 terminal compatibility helpers、`host-factory.ts` 下的 host creation，以及 `render/` 下的 event rendering。

## 命令

- `guga`：当 stdin/stdout 是 TTY 时启动交互式 workbench。
- `guga chat` 或 `guga interactive`：显式交互别名。
- `guga run "<prompt>"`：运行一次 headless prompt。
- `guga -p "<prompt>"`：headless mode 的短 one-shot 别名。
- `guga init`：初始化用户或项目 config。
- `guga login <provider>`：配置 provider credentials 或受支持的 OAuth flows。
- `guga logout <provider>`：移除本地 Guga-owned provider credentials。
- `guga auth status [provider]`：检查已脱敏的 provider auth state。
- `guga --list-models`：打印 model aliases 和 defaults。

常见 run flags 包括 `--mock`、`--debug-events`、`--ops`、`--profile`、`--provider` 和 `--model`。

## 常见用法

```sh
guga
guga run "summarize the repo" --mock --debug-events
guga -p "summarize the repo"
guga login openai --api-key-env OPENAI_API_KEY
guga auth status
guga --list-models
```

## 参数说明

- `guga run "<prompt>"` 和 `guga -p "<prompt>"`：`<prompt>` 必填，多个非 flag 参数会用空格拼接；`--mock` 使用 mock runtime；`--debug-events` 输出调试事件渲染；`--ops` 在 run 后打印 operational status；`--profile <id>` 选择 CLI profile；`--provider <id>` 指定 provider；`--model <id>` 指定 model selector；`--headless` 可被解析，但 `run` 本身已经是 headless 路径。
- `guga`、`guga chat`、`guga interactive`：进入交互式 workbench；可使用与 run 共用的 `--mock`、`--debug-events`、`--ops`、`--profile`、`--provider`、`--model`。交互模式要求 stdin/stdout 都是 TTY。
- `guga init`：默认写 user config；`--user` 或 `--project` 选择 scope；`--force` 允许覆盖；`--provider <id>`、`--provider-mode <mode>`、`--model <id>`、`--base-url <url>`、`--api-key-env <env>` 可初始化 provider/model 配置。
- `guga login <provider>`：`<provider>` 必填；`--mode <mode>` 或 `--provider-mode <mode>` 选择 provider mode；`--api-key <value>` 直接写入 secret；`--api-key-env <env>` 引用环境变量；`--model <id>` 绑定默认模型；`--static` 表示保存 static secret。未提供 API key 时，只有受支持 OAuth provider 会尝试 OAuth。
- `guga logout <provider>`：`<provider>` 必填，用于移除 Guga 管理的本地 provider credentials。
- `guga auth status [provider]`：`provider` 可选；省略时展示全部已知 provider 的脱敏 auth state。
- `guga --list-models`：无额外参数，列出已配置 model aliases、默认标记和不可用原因。
- `runCli(argv, io)`：内部测试/入口函数；`argv` 不包含 node/bin 前缀；`io.stdout` 和 `io.stderr` 需要提供 `write()`，`stdin` 与 `isTTY` 决定是否允许交互模式，`env` 可覆盖环境变量，`oauthLoginRunner` 可注入 OAuth 登录实现。

## 内部入口点

- `src/index.ts`：调用 `runCli(process.argv.slice(2), io)` 的可执行入口。
- `runCli(argv, io)`：由 tests 和 executable 使用的 command parser 和 dispatcher。
- Host construction 位于 `host-factory.ts`；rendering 位于 `render/` 下；Ink workbench code 位于 `ink-workbench/` 下。

## 注意事项

- 在 TTY 中运行裸 `guga` 会打开 Ink workbench。非 TTY headless commands 会流式输出 host events，并在 run 结束后关闭 local host。
- Codex OAuth support 作为 pending/injected-runner path 存在，除非 host 提供 runner，否则可能被禁用。
- Runtime state 默认位于 Guga Home，通常是 `~/.guga`，除非 config 或 `GUGA_HOME` 覆盖它。

## 相关包

- `@guga-agent/host-sdk`、`@guga-agent/host-runtime` 和 `@guga-agent/host-protocol` 提供 host bridge。
- Profile 和 plugin packages 提供 code、research、review、storage、ops、memory、eval 和 web-search capabilities。
