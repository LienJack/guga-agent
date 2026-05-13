# 内部模块: Provider (模型提供商)

> OpenCode 的 LLM 抽象层，支持 20+ AI 模型提供商的统一接口。

## 1. 概览 (Overview)

- **路径**: `packages/opencode/src/provider/`
- **定位**: 模型提供商的统一抽象层，让 OpenCode 支持任何 LLM
- **核心职责**:
  - 提供商注册和初始化
  - 模型元数据管理（能力、定价、限制）
  - 请求/响应转换
  - 认证和 API Key 管理

### 核心文件列表

| 文件 | 行数 | 职责 |
|------|------|------|
| **provider.ts** | ~39,812 | 核心提供商逻辑、SDK 初始化 |
| **transform.ts** | ~20,988 | 请求/响应转换、参数映射 |
| **models.ts** | ~3,167 | 模型定义和元数据 |
| **auth.ts** | ~3,798 | 认证系统和 API Key 管理 |

---

## 2. 支持的提供商

OpenCode 内置支持 **20+ AI 提供商**：

### 2.1 主流提供商

| 提供商 | SDK | 支持模型 |
|--------|-----|----------|
| **Anthropic** | `@ai-sdk/anthropic` | Claude 3/3.5/4 系列 |
| **OpenAI** | `@ai-sdk/openai` | GPT-4o, GPT-4, o1, o3 |
| **Google** | `@ai-sdk/google` | Gemini 1.5/2.0 |
| **xAI** | `@ai-sdk/xai` | Grok 系列 |
| **Azure OpenAI** | `@ai-sdk/azure` | Azure 托管的 OpenAI 模型 |
| **Amazon Bedrock** | `@ai-sdk/amazon-bedrock` | AWS 托管的多种模型 |

### 2.2 开源/API 聚合

| 提供商 | SDK | 说明 |
|--------|-----|------|
| **OpenRouter** | `@openrouter/ai-sdk-provider` | 100+ 模型聚合平台 |
| **Groq** | `@ai-sdk/groq` | 超快推理 |
| **Together AI** | `@ai-sdk/togetherai` | 开源模型托管 |
| **DeepInfra** | `@ai-sdk/deepinfra` | 开源模型 API |
| **Cerebras** | `@ai-sdk/cerebras` | Llama 3 优化 |

### 2.3 专业提供商

| 提供商 | SDK | 说明 |
|--------|-----|------|
| **Mistral** | `@ai-sdk/mistral` | Mistral 系列模型 |
| **Cohere** | `@ai-sdk/cohere` | Command 系列 |
| **Perplexity** | `@ai-sdk/perplexity` | Sonar 系列 |
| **GitHub Copilot** | 自定义 | GitHub Models |
| **OpenCode** | 自定义 | OpenCode 官方模型 |

---

## 3. 核心架构

### 3.1 Provider 数据结构

```typescript
// src/provider/provider.ts
export namespace Provider {
  export const Info = z.object({
    id: z.string(),              // "anthropic", "openai"...
    name: z.string(),             // "Anthropic"
    package: z.string(),          // "@ai-sdk/anthropic"
    env: z.array(z.string()),    // ["ANTHROPIC_API_KEY"]
    models: z.record(z.string(), Model),  // 模型列表
    options: z.record(z.string(), z.any()).optional(),
  })
  
  export const Model = z.object({
    id: z.string(),              // "claude-sonnet-4"
    name: z.string(),            // "Claude Sonnet 4"
    limit: z.object({
      context: z.number(),       // 200000 tokens
      output: z.number(),        // 16000 tokens
    }),
    cost: z.object({
      input: z.number(),         // $3 per MTok
      output: z.number(),        // $15 per MTok
      cache: z.object({
        read: z.number(),        // $0.30 per MTok
        write: z.number(),       // $3.75 per MTok
      }).optional(),
    }),
    capabilities: z.object({
      vision: z.boolean().optional(),     // 支持图片
      thinking: z.boolean().optional(),   // 支持推理
      tools: z.boolean().optional(),      // 支持工具调用
    }),
  })
}
```

### 3.2 Provider 初始化流程

```typescript
// src/provider/provider.ts (简化)
export async function initialize(providerID: string): Promise<SDK> {
  const providers = await list()
  const provider = providers[providerID]
  
  // 1. 检查是否有内置 SDK
  const createFn = BUNDLED_PROVIDERS[provider.package]
  
  if (!createFn) {
    throw new Error(`Provider ${providerID} not found`)
  }
  
  // 2. 获取 API Key
  const apiKey = await getApiKey(provider)
  
  // 3. 应用自定义配置
  const customLoader = CUSTOM_LOADERS[providerID]
  const custom = customLoader ? await customLoader(provider) : {}
  
  // 4. 创建 SDK 实例
  const sdk = createFn({
    apiKey,
    ...provider.options,
    ...custom.options,
  })
  
  return sdk
}
```

---

## 4. 模型选择与转换

### 4.1 获取模型实例

```typescript
// src/provider/provider.ts
export async function getModel(input: {
  providerID: string
  modelID: string
}): Promise<LanguageModelV2> {
  // 1. 初始化 Provider SDK
  const sdk = await initialize(input.providerID)
  
  // 2. 检查自定义 model loader
  const customLoader = CUSTOM_LOADERS[input.providerID]
  if (customLoader?.getModel) {
    return await customLoader.getModel(sdk, input.modelID)
  }
  
  // 3. 使用默认方式获取模型
  return sdk.chat(input.modelID)
  // 或 sdk.responses(input.modelID) 用于支持 structured output
}
```

### 4.2 请求转换 (ProviderTransform)

**文件**: `src/provider/transform.ts`

不同 Provider 的请求格式可能不同，需要统一转换：

```typescript
// src/provider/transform.ts (简化)
export namespace ProviderTransform {
  export function transformRequest(input: {
    provider: string
    messages: CoreMessage[]
    tools?: ToolSet
  }) {
    // Anthropic: 需要特殊的 headers
    if (input.provider === "anthropic") {
      return {
        ...input,
        headers: {
          "anthropic-beta": "claude-code-20250219,thinking-2025-05-14"
        }
      }
    }
    
    // GitHub Copilot: 使用 responses API
    if (input.provider === "github-copilot") {
      return {
        ...input,
        useResponsesAPI: true
      }
    }
    
    return input
  }
}
```

---

## 5. 认证系统

### 5.1 API Key 获取优先级

```typescript
// src/provider/auth.ts
export async function getApiKey(provider: Info): Promise<string | undefined> {
  // 1. 环境变量 (最高优先级)
  for (const envVar of provider.env) {
    const value = process.env[envVar]
    if (value) return value
  }
  
  // 2. 配置文件
  const config = await Config.get()
  const apiKey = config.provider?.[provider.id]?.options?.apiKey
  if (apiKey) return apiKey
  
  // 3. Auth 存储 (加密保存)
  const stored = await Auth.get(provider.id)
  if (stored) return stored.apiKey
  
  // 4. 默认值
  return undefined
}
```

### 5.2 安全存储

```typescript
// API Keys 加密存储在 ~/.opencode/data/auth.json
await Auth.set("anthropic", {
  apiKey: "sk-ant-...",
  createdAt: Date.now(),
})

// 读取
const auth = await Auth.get("anthropic")
console.log(auth.apiKey)  // "sk-ant-..."
```

---

## 6. 模型元数据

### 6.1 从 models.dev 获取

OpenCode 使用 `models.dev` API 获取最新的模型信息：

```typescript
// src/provider/models.ts
export namespace ModelsDev {
  export async function fetch(): Promise<Provider.Info[]> {
    const response = await fetch("https://models.dev/api/models")
    const data = await response.json()
    
    // 转换为 OpenCode 格式
    return data.providers.map(p => ({
      id: p.id,
      name: p.name,
      package: p.package,
      env: p.env,
      models: Object.fromEntries(
        p.models.map(m => [m.id, {
          id: m.id,
          name: m.name,
          limit: {
            context: m.contextWindow,
            output: m.maxOutputTokens,
          },
          cost: {
            input: m.pricing.input,
            output: m.pricing.output,
            cache: m.pricing.cache,
          },
          capabilities: {
            vision: m.capabilities.vision,
            thinking: m.capabilities.thinking,
            tools: m.capabilities.tools,
          }
        }])
      )
    }))
  }
}
```

---

## 7. 配置示例

### 7.1 基本配置

```json
// opencode.json
{
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "${ANTHROPIC_API_KEY}"
      }
    },
    "openai": {
      "options": {
        "apiKey": "${OPENAI_API_KEY}",
        "baseURL": "https://api.openai.com/v1"
      }
    }
  }
}
```

### 7.2 禁用提供商

```json
{
  "disabled_providers": ["cohere", "mistral"]
}
```

### 7.3 自定义 Provider

```json
{
  "provider": {
    "my-provider": {
      "package": "@ai-sdk/openai-compatible",
      "env": ["MY_API_KEY"],
      "options": {
        "baseURL": "https://my-llm-api.com/v1",
        "apiKey": "${MY_API_KEY}"
      },
      "models": {
        "my-model": {
          "id": "my-model-v1",
          "name": "My Custom Model",
          "limit": {
            "context": 100000,
            "output": 8000
          },
          "cost": {
            "input": 1.0,
            "output": 3.0
          }
        }
      }
    }
  }
}
```

---

## 8. 实战场景

### 场景 1: 切换模型

```typescript
// 用户配置默认模型
const config = await Config.get()
const defaultModel = config.default_model ?? {
  providerID: "anthropic",
  modelID: "claude-sonnet-4"
}

// 获取模型实例
const model = await Provider.getModel(defaultModel)

// 使用模型
const result = await generateText({
  model,
  prompt: "Hello!"
})
```

### 场景 2: 对比提供商成本

```typescript
const providers = await Provider.list()

for (const [id, provider] of Object.entries(providers)) {
  for (const [modelID, model] of Object.entries(provider.models)) {
    console.log(`${id}/${modelID}:`)
    console.log(`  Input: $${model.cost.input}/MTok`)
    console.log(`  Output: $${model.cost.output}/MTok`)
  }
}
```

---

## 9. 常见陷阱

### ❌ 陷阱 1: API Key 未设置

**问题**: Provider 初始化失败

**解决方案**:
```bash
# 设置环境变量
export ANTHROPIC_API_KEY="sk-ant-..."

# 或在配置文件中设置
```

### ✅ 最佳实践: 使用环境变量

```json
{
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "${ANTHROPIC_API_KEY}"  // 从环境变量读取
      }
    }
  }
}
```

---

## 10. 总结

Provider 模块是 OpenCode **模型无关性**的基础：

### 核心特性
- ✅ **20+ 提供商**: Anthropic, OpenAI, Google, xAI...
- ✅ **统一接口**: 基于 Vercel AI SDK
- ✅ **自动转换**: 请求/响应适配
- ✅ **元数据管理**: 定价、限制、能力

### 关键实现
- **Provider.initialize**: 初始化 SDK
- **Provider.getModel**: 获取模型实例
- **ProviderTransform**: 请求转换
- **Auth**: 安全的 API Key 管理

**下一步**: 增强现有的工具文档
