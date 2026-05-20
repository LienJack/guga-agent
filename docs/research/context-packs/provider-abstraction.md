# Provider Abstraction Context Pack

## 问题边界

Guga Agent 需要一个 LLM Provider 抽象层，解决以下问题：

1. **多 Provider 统一接口** — Anthropic Messages API、OpenAI Chat Completions、OpenAI Responses API、AWS Bedrock Converse API 格式不同
2. **模型路由** — 根据任务类型（主推理 vs 辅助任务）选择合适的模型；根据成本/延迟智能路由
3. **Streaming** — 各 Provider 的 streaming 协议差异（SSE chunks 格式不同）
4. **Fallback 与降级** — Provider 不可用（402 余额耗尽、429 限速、401 过期）时自动切换
5. **凭证管理** — 多 Key 轮换、OAuth Token 刷新、跨进程同步
6. **Prompt Caching** — Anthropic 的 cache_control 断点优化（节省 ~75% 输入成本）
7. **定价感知** — 实时跟踪 token 用量和成本
8. **Transport 适配** — 消息/工具格式转换封装在独立层，主循环无感知

## 参考项目与版本

| 项目 | Commit | 语言 | Provider 核心路径 |
|-------|--------|------|------------------|
| hermes-agent | `dd0923bb` | Python | `agent/transports/`, `agent/auxiliary_client.py`, `agent/credential_pool.py`, `agent/anthropic_adapter.py`, `agent/model_metadata.py` |
| opencode | `caf1151c` | TypeScript | `packages/opencode/src/provider/provider.ts` (~39K行), `transform.ts` (~21K行), `models.ts`, `auth.ts` |
| deer-flow | `84f88b66` | Python | `backend/src/config/model_config.py`, `backend/src/models/factory.py`, `backend/src/reflection/resolvers.py` |
| blade-agent-sdk | `5d67e5ed` | TypeScript | `src/agent/ModelManager.ts`, `src/providers/` |

## 必读分析材料

| 文件 | 核心价值 |
|------|---------|
| `docs/research/source-analysis/hermes-wiki/concepts/provider-transport-architecture.md` | Transport ABC 设计：四抽象方法 + 三钩子，惰性注册表 |
| `docs/research/source-analysis/hermes-agent-anatomy/docs/04-多Provider适配.md` | 完整适配层实现细节：Anthropic 转换、OAuth 伪装、辅助路由链、凭证池 |
| `docs/research/source-analysis/hermes-wiki/concepts/auxiliary-client-architecture.md` | 辅助客户端路由器：多层 fallback、适配器模式、支付降级 |
| `docs/research/source-analysis/hermes-wiki/concepts/smart-model-routing.md` | 10 级上下文长度解析链、models.dev 集成、本地服务器探测 |
| `docs/research/source-analysis/hermes-wiki/concepts/credential-pool-and-isolation.md` | 凭证池 4 种策略、耗尽冷却、并发租约、OAuth 跨进程同步 |
| `docs/research/source-analysis/hermes-wiki/concepts/prompt-caching-optimization.md` | Anthropic system_and_3 缓存策略、滚动窗口、成本效益分析 |
| `docs/research/source-analysis/learn-opencode/docs/internals/provider.md` | OpenCode Provider 架构：Vercel AI SDK 抽象、20+ 提供商、模型元数据 |
| `docs/research/source-analysis/learn-opencode/docs/internals/config.md` | OpenCode 多层配置合并、Provider 配置结构 |
| `docs/research/source-analysis/deerflow-book/chapters/22-model-config.md` | DeerFlow "配置即代码"：`use` 字段动态加载、`extra="allow"` 透传 |

## 必读源码文件

### Hermes Agent (Python)

| 文件 | Tokens | 职责 |
|------|--------|------|
| `agent/transports/base.py` | ~89行 | `ProviderTransport` ABC 定义 |
| `agent/transports/__init__.py` | ~51行 | 注册表 + `get_transport()` 惰性发现 |
| `agent/transports/anthropic.py` | ~177行 | Anthropic Messages 转换 |
| `agent/transports/chat_completions.py` | ~387行 | OpenAI Chat Completions 转换 |
| `agent/transports/codex.py` | ~217行 | OpenAI Responses API 转换 |
| `agent/transports/bedrock.py` | ~154行 | AWS Bedrock Converse 转换 |
| `agent/transports/types.py` | ~142行 | `NormalizedResponse` 共享类型 |
| `agent/anthropic_adapter.py` | 20,648 tokens | Anthropic 完整适配（格式转换 + thinking + OAuth 伪装） |
| `agent/auxiliary_client.py` | 44,758 tokens | 辅助客户端路由器（Provider 解析链 + 适配器 + fallback） |
| `agent/credential_pool.py` | 13,966 tokens | 凭证池（4 策略 + 耗尽恢复 + 并发租约） |
| `agent/model_metadata.py` | 17,711 tokens | 上下文长度检测、端点探测、token 估算 |
| `agent/prompt_caching.py` | 1,788 tokens | Anthropic cache_control 断点注入 |
| `run_agent.py` | 153,077 tokens | 主循环，10+ Transport 接入点 |

### OpenCode (TypeScript)

| 文件 | Tokens | 职责 |
|------|--------|------|
| `packages/opencode/src/provider/provider.ts` | ~39,812 | 核心 Provider 逻辑、SDK 初始化、getModel |
| `packages/opencode/src/provider/transform.ts` | ~20,988 | 请求/响应转换、参数映射 |
| `packages/opencode/src/provider/models.ts` | ~3,167 | 模型定义和元数据 |
| `packages/opencode/src/provider/auth.ts` | ~3,798 | 认证系统和 API Key 管理 |

### Blade Agent SDK (TypeScript)

| 文件 | Tokens | 职责 |
|------|--------|------|
| `src/agent/ModelManager.ts` | 1,035 | 模型管理器 |
| `src/providers/` | ~6,232 | Provider 实现 |

## 关键抽象

### 1. Transport ABC（Hermes 的核心设计）

```python
class ProviderTransport(ABC):
    @abstractmethod def convert_messages(messages, **kwargs) -> Any
    @abstractmethod def convert_tools(tools) -> Any
    @abstractmethod def build_kwargs(model, messages, tools=None, **params) -> Dict
    @abstractmethod def normalize_response(response, **kwargs) -> NormalizedResponse
    # 可选钩子
    def validate_response(response) -> bool
    def extract_cache_stats(response) -> Optional[Dict]
    def map_finish_reason(raw_reason) -> str
```

**职责分离**：Transport 只负责数据格式转换。Client 生命周期、streaming、auth、retry、interrupt 全在 `AIAgent` 层。

### 2. 辅助客户端路由链（主推理 vs 辅助任务的分离）

```
主推理：用户选的 Provider → 单一路径
辅助任务（压缩/搜索/视觉）：
  1. 非聚合器的主 Provider → 直接用（减少配置）
  2. OpenRouter
  3. Nous Portal
  4. 自定义端点
  5. Codex OAuth
  6. 原生 Anthropic / API Key Providers
  7. None（功能不可用）
```

### 3. 凭证池策略

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| `fill_first` | 用完一个才换下一个 | 单人使用 |
| `round_robin` | 依次轮换 | 均匀负载 |
| `random` | 随机选 | 简单公平 |
| `least_used` | 选最少用的 | 精确均衡 |

轮换触发：402 立即轮换；429 第一次重试相同凭证、第二次轮换；401 先刷新、失败再轮换。

### 4. OpenCode 的 Vercel AI SDK 统一

```typescript
Provider.Info = { id, name, package, env, models, options }
Provider.Model = { id, limit: {context, output}, cost: {input, output, cache}, capabilities }
// 所有 Provider 通过 sdk.chat(modelID) 获取 LanguageModelV2 实例
```

### 5. DeerFlow 的 "配置即代码" 方案

```python
ModelConfig:
  use: "langchain_openai:ChatOpenAI"  # 动态 import
  model: "gpt-4"
  extra="allow"  # 任意参数透传
```

工厂函数通过 `importlib.import_module` 运行时加载类，无需预先注册。

### 6. Prompt Caching 策略（Anthropic 专属）

- 4 个 cache_control 断点：系统提示 + 最后 3 条消息
- 滚动窗口：每轮请求断点向后移动
- 成本节省：~75% 输入 token 成本
- 纯函数设计：输入消息列表 → 输出标记后列表，无状态

## 已确认事实

1. **内部统一格式选 OpenAI** — Hermes、OpenCode 都用 OpenAI 消息格式作为内部表示，出口处做 Provider 特定转换。这是行业事实标准。

2. **Transport 层和 Agent 层职责分离** — Transport 只做格式转换（纯数据），不管 streaming/retry/auth。这让每个 Transport 都可以独立单元测试。

3. **辅助任务单独路由** — 主推理和辅助任务（压缩/摘要/视觉）使用不同的 Provider，辅助任务优先用便宜模型。Hermes 的辅助路由链是最完整的实现。

4. **惰性加载** — Hermes 的 `get_transport()` 按需 import SDK 模块；DeerFlow 的 `use` 字段运行时动态加载。两者都避免启动时 import 全部 SDK 的开销。

5. **models.dev 是模型元数据事实标准** — Hermes 和 OpenCode 都集成了 models.dev（4000+ 模型库），用于获取上下文长度、定价、能力信息。

6. **Anthropic 转换最复杂** — 严格角色交替、system 抽离、thinking 块签名管理、tool_use/tool_result 配对检查、adaptive vs manual thinking 映射。占代码量最大。

7. **凭证轮换是生产刚需** — HTTP 402/429/401 自动处理 + 冷却恢复 + OAuth 跨进程同步。Hermes 实现了完整方案，OpenCode/DeerFlow 未实现。

8. **Prompt Caching 仅 72 行** — Hermes 的实现极其精简，纯函数无状态，但能节省 ~75% Anthropic 输入成本。

## Guga 迁移判断

### 必须采用

| 模式 | 理由 | 参考 |
|------|------|------|
| **Transport ABC 分层** | Provider 适配逻辑必须封装到独立类，主循环不能有 `if provider == ...` 分支 | Hermes `agent/transports/` |
| **OpenAI 格式为内部统一表示** | 生态最大，大部分 Provider 兼容直通，只需适配 Anthropic/Bedrock 出口 | Hermes + OpenCode 共识 |
| **主/辅分离路由** | 辅助任务（压缩/搜索）用便宜模型，不应和主推理抢同一个 Provider | Hermes `auxiliary_client.py` |
| **Prompt Caching** | 72 行纯函数可直接复用，长对话场景成本差距巨大 | Hermes `agent/prompt_caching.py` |

### 应当采用（Phase 2）

| 模式 | 理由 | 参考 |
|------|------|------|
| **凭证池** | 多 Key 轮换 + 自动故障转移，生产环境必备 | Hermes `credential_pool.py` |
| **models.dev 集成** | 避免硬编码上下文长度/定价，4000+ 模型自动更新 | Hermes `models_dev.py` + OpenCode `models.ts` |
| **支付降级** | 402 时自动切 Provider，用户无感 | Hermes `_is_payment_error` + `_try_payment_fallback` |
| **惰性注册表** | 按需加载 Provider SDK，减少启动开销 | Hermes `transports/__init__.py` |

### 可延后

| 模式 | 理由 |
|------|------|
| OAuth 伪装（Claude Code 身份） | 仅 Hermes 需要（借用 Claude Pro 订阅），Guga 暂无此需求 |
| 10 级上下文长度解析链 | 过度工程化，Guga 初期用 models.dev + 硬编码默认值即可 |
| DeerFlow 的 `use` 字段动态加载 | LangChain 特有设计，Guga 如果不用 LangChain 则无关 |
| 本地服务器自动探测（Ollama/vLLM） | 看用户需求，初期可要求手动配置 |

### Guga 建议架构

```
┌─────────────────────────────────────────────────┐
│  AgentLoop（主循环）                              │
│  内部消息格式：OpenAI Chat Completions           │
└────────────────────┬────────────────────────────┘
                     │
    ┌────────────────┼──────────────────────┐
    │                │                      │
    ▼                ▼                      ▼
┌──────────┐  ┌──────────────┐   ┌───────────────┐
│ Transport│  │  Transport   │   │   Transport   │
│ Anthropic│  │  OpenAI-Compat│   │   Bedrock     │
└──────────┘  └──────────────┘   └───────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    主推理路径              辅助任务路径
    (用户配置模型)          (自动选最便宜可用)
         │                       │
    CredentialPool          FallbackChain
    (多 Key 轮换)           (402/429 自动降级)
```

**TypeScript 实现要点**：
- Transport 用 abstract class 或 interface + registry pattern
- 使用 Vercel AI SDK (`@ai-sdk/*`) 作为 Provider SDK 层（OpenCode 验证过可行）
- 配置用 JSON + Zod Schema 验证（OpenCode 模式）
- models.dev 用三级缓存（内存 → 磁盘 → 网络）

## 待验证问题

1. **Vercel AI SDK vs 自研 Transport？** — OpenCode 用 Vercel AI SDK 统一了 20+ Provider，但仍需要 `transform.ts` (~21K行) 做差异适配。Guga 是否直接采用 AI SDK，还是参考 Hermes 自研 Transport ABC？

2. **Streaming 抽象层级** — Hermes 的 Transport 不管 streaming（在 AIAgent 层），但 OpenCode 的 AI SDK 内置了流式。Guga 的 streaming 应该放在哪一层？

3. **Anthropic thinking 签名问题** — 上下文压缩会破坏 thinking 块签名，Hermes 的策略是只保留最后一条 assistant 的 thinking。Guga 是否需要处理？取决于是否支持 extended thinking。

4. **辅助任务是否需要 async？** — Hermes 的 auxiliary_client 同时提供 sync 和 async 接口。Guga 在 Node.js 环境下天然异步，是否还需要显式区分？

5. **凭证池的持久化格式** — Hermes 用 YAML 文件。Guga 是否用 JSON（与 opencode.json 对齐）或 SQLite？
