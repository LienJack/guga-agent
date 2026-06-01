<p align="center">
  <img src="assets/guga-mascot-pixel.png" alt="Guga Agent のピクセルアートマスコット" width="180">
</p>

<h1 align="center">Guga Agent</h1>

<p align="center">
  小さなコア、強いプラグイン、復旧可能、監査可能、組み込み可能な Agent Runtime。
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.ja.md">日本語</a>
</p>

---

## Guga Agent とは

Guga Agent は、agent プロダクトを作る開発者向けの TypeScript runtime monorepo です。大きなチャットアプリを先に作り、あとから SDK を切り出すアプローチではありません。まず、実運用の agent システムを支える部分、つまりモデル呼び出し、ツール実行、権限、コンテキスト、イベント、プラグイン、セッション保存、artifact、replay を、明確な runtime 境界として設計します。

一言でいえば、Guga Agent は「動く agent demo」を、出荷でき、復旧でき、監査でき、実プロダクトに組み込める agent システムへ育てるための基盤です。

## 解決する問題

多くの agent プロトタイプは「モデル + ツール」に見えます。しかし実際の業務フローに入ると、同じ問題にぶつかります。

- 長いタスクでコンテキストが溢れ、圧縮後に安全に続行できるか分からない。
- ツールはファイルを読み書きし、コマンドを実行できるが、権限、監査、結果の回流が各所に散らばる。
- Provider SDK の型がメインループへ漏れ、モデル切り替え、retry、fallback が全体に波及する。
- UI、CLI、IDE、API が同じ run を見たいのに、それぞれ文字列や一時状態を解析してしまう。
- セッションがメモリ上でしか生きず、クラッシュ、キャンセル、再起動、分岐、replay が壊れやすい。
- プラグインとツールが増えるほど、順序、namespace、権限、stale context の管理が不安定になる。

Guga はこれらを runtime に戻します。モデルは意図を提案し、runtime が実行境界を持つ。コンテキストは投影であり、唯一の事実源ではない。イベントは台帳であり、UI と監査ビューはそこから派生します。

## 設計思想

### 小さなコア、大きな周辺

`@guga-agent/core` が持つのは、agent lifecycle、状態機械、イベント、hook、capability registration、permission protocol、tool execution pipeline、core contract だけです。実 provider、ファイルシステム、shell、git、session store、artifact store、context policy はプラグインとして接続します。

### プラグインは一級市民

first-party capability と host 側の custom capability は同じ plugin context を使います。provider、tool、hook、store、context policy を登録できます。プラグインは core state を直接変更せず、明示的な capability registration と typed hook result を通じて runtime に参加します。

### イベントは事実源

モデルリクエスト、ツール呼び出し、権限判断、hook 判断、usage、artifact、エラー、compaction boundary、replay の手がかりは、すべて記録可能な事実になるべきです。最終回答は結果であり、復旧と監査の基礎は event ledger です。

### 権限は runtime が実行する

モデルは「なぜその操作をしたいか」を説明できますが、自分自身を認可することはできません。すべての tool intent は `ExecutionPipeline` に入り、schema、hook、permission、scheduler、timeout、result policy、event recording を通ります。

### コンテキストは投影

モデル入力は、履歴を際限なく連結したものではありません。conversation state、context source、artifact reference、compaction boundary、policy から投影されます。summary は長いタスクを続けるための手段であり、唯一の事実源ではありません。

### 商用レベルの機能は段階的に育てる

Guga は初日から完全な marketplace、長期記憶、multi-agent swarm、enterprise console を作ろうとはしません。まず loop、tool、provider、context、session、replay の境界を安定させ、その上でプラグインエコシステムとしてプロダクト機能を育てます。

## 現在の機能

| 機能 | パッケージ | 説明 |
| --- | --- | --- |
| Core Runtime | `@guga-agent/core` | Provider-neutral message、`AgentLoop`、`ConversationState`、`CapabilityRegistry`、`EventBus`、`ProviderRouter`、hook contract、permission、tool execution pipeline、result policy。 |
| AI SDK Provider Bridge | `@guga-agent/provider-ai-sdk` | Vercel AI SDK provider を Guga provider runtime contract にマップします。`gateway`、`openai-compatible`、`openai`、`anthropic` モードをサポートします。 |
| Filesystem Tools | `@guga-agent/plugin-tools-filesystem` | `fs_read`、`fs_write`、`fs_edit`、`fs_list`、`fs_search` を登録し、realpath containment で workspace 外への escape を防ぎます。 |
| Shell Tool | `@guga-agent/plugin-tools-shell` | `shell_exec` を登録します。ask-by-default、serial-only、環境変数制限つきで、host は sandbox backend を差し替えられます。 |
| Git Tools | `@guga-agent/plugin-tools-git` | `git_status`、`git_diff`、`git_commit_message` などの安全な補助ツールを提供します。push、reset、rebase、履歴書き換えは公開しません。 |
| JSONL Session Store | `@guga-agent/plugin-session-jsonl` | local-first の append-only event/session store。revision check、idempotency、hash-chain continuity、corruption diagnostics を備えます。 |
| Artifact Store | `@guga-agent/plugin-artifact-filesystem` | 大きな tool output と replay artifact をファイルシステムに保存し、event には bounded preview と検証可能な reference だけを残します。 |
| Replay Audit | `@guga-agent/plugin-replay-audit` | durable facts から conversation、model-input、audit timeline を派生させます。provider、tool、mutating hook は再実行しません。 |
| Default Context Policy | `@guga-agent/plugin-context-default` | resources、assemble、budget、truncate、compact、reinject 各 phase の default context policy と hook を登録します。 |

## 使い方

このリポジトリは、現時点では公開済みのターミナルアプリというより、runtime/workbench の基盤に近い状態です。開発と検証は monorepo コマンドから始めます。

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

最小の host は通常、runtime を作り、provider とプラグインをマウントして、1 turn を実行します。

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createAiSdkProviderPlugin } from "@guga-agent/provider-ai-sdk";
import { createFilesystemPlugin } from "@guga-agent/plugin-tools-filesystem";
import { createJsonlSessionPlugin } from "@guga-agent/plugin-session-jsonl";

const runtime = createAgentRuntime({
  plugins: [
    createAiSdkProviderPlugin({
      id: "local-provider",
      mode: "openai-compatible",
      modelId: "local-model",
      baseURL: "http://localhost:11434/v1",
      apiKey: "test",
      metadata: {
        purposes: ["primary"],
        capabilities: { toolCalling: true, usage: "optional" }
      }
    }),
    createFilesystemPlugin({ workspaceRoot: process.cwd() }),
    createJsonlSessionPlugin({ rootDir: ".guga/sessions" })
  ]
});
```

## OpenCode と Pi Agent との関係

Guga は成熟した open-source agent project から学びますが、プロダクトの重心は異なります。

- OpenCode は、TUI、client/server architecture、multi-provider、ユーザーが直接使う体験を重視した、より完成形に近い open-source coding agent product です。
- Pi Agent は、monorepo、runtime、extension、session、data flywheel を重視した self-extensible agent harness に近い存在です。
- Guga は、agent product builder のための runtime foundation を目指します。CLI、Web、IDE、worker、enterprise console が同じ runtime facts を共有できるよう、組み込み可能な境界を優先します。

## ロードマップの方向性

- core runtime、provider bridge、tool pipeline、permission kernel、event facts を安定させる。
- context projection、tool result budget、compaction boundary、session resume を強化する。
- local plugin host を改善し、manifest、namespace、reload、stale context guard へ発展させる。
- skills、MCP、eval、multi-agent delegation、UI projection、operations-layer capability を追加する。
- 実 provider と実タスクの圧力を受けてから、model operations、cost tracking、credential pool、remote sandbox、enterprise policy へ進む。

## 現在の状態

Guga Agent はまだ early runtime architecture stage にあります。core contract、first-party provider bridge、tool plugin、JSONL session、artifact、replay audit の基礎パッケージはありますが、まだすぐに使える完成済み coding agent application ではありません。

Guga の上にプロダクトを作る場合は、単純な chat UI wrapper ではなく、agent runtime foundation として扱ってください。

## ライセンス

このプロジェクトは Apache License 2.0 の下で提供されています。詳しくは [LICENSE](LICENSE) を参照してください。
