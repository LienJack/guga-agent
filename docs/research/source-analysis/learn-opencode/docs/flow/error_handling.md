# 错误处理 (Error Handling)

> OpenCode 的错误捕获、处理和恢复机制。

---

## 1. 错误类型

```typescript
enum ErrorType {
  // LLM 相关
  LLM_TIMEOUT = "LLM_TIMEOUT",
  LLM_QUOTA_EXCEEDED = "LLM_QUOTA_EXCEEDED",
  LLM_INVALID_RESPONSE = "LLM_INVALID_RESPONSE",
  
  // 工具相关
  TOOL_EXECUTION_FAILED = "TOOL_EXECUTION_FAILED",
  TOOL_TIMEOUT = "TOOL_TIMEOUT",
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  
  // 权限相关
  PERMISSION_DENIED = "PERMISSION_DENIED",
  PERMISSION_TIMEOUT = "PERMISSION_TIMEOUT",
  
  // 系统相关
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  NETWORK_ERROR = "NETWORK_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR"
}
```

---

## 2. 错误处理策略

### 2.1 工具执行失败

```typescript
try {
  const result = await executeTool(toolID, args)
} catch (error) {
  // 记录错误
  await Errors.create({
    type: ErrorType.TOOL_EXECUTION_FAILED,
    toolID,
    error: error.message,
    timestamp: new Date()
  })
  
  // 通知 LLM
  const errorMessage: ToolResultMessage = {
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify({
      error: error.message,
      suggestion: getSuggestion(error)
    })
  }
  
  // LLM 可以根据错误决定重试或尝试其他方法
  session.messages.push(errorMessage)
}
```

### 2.2 LLM 超时

```typescript
export async function callLLMWithRetry(
  prompt: string,
  maxRetries: number = 3
): Promise<LLMResponse> {
  let lastError: Error
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await llm.complete(prompt, {
        timeout: 60000 // 60秒
      })
      return response
    } catch (error) {
      lastError = error
      
      if (error.code === "TIMEOUT") {
        log.warn(`LLM timeout, retrying... (${i + 1}/${maxRetries})`)
        continue
      }
      
      // 其他错误直接抛出
      throw error
    }
  }
  
  throw new Error(`LLM failed after ${maxRetries} retries: ${lastError.message}`)
}
```

---

## 3. 自动恢复

```typescript
export async function recoverFromError(
  error: Error,
  context: RecoveryContext
): Promise<RecoveryAction> {
  // 1. 分析错误类型
  const errorType = classifyError(error)
  
  // 2. 根据类型选择恢复策略
  switch (errorType) {
    case ErrorType.TOOL_EXECUTION_FAILED:
      return {
        action: "retry_with_fix",
        suggestion: "检查工具参数并重试"
      }
    
    case ErrorType.PERMISSION_DENIED:
      return {
        action: "request_permission",
        suggestion: "请求用户授权"
      }
    
    case ErrorType.LLM_TIMEOUT:
      return {
        action: "switch_model",
        suggestion: "切换到更快的模型"
      }
    
    default:
      return {
        action: "abort",
        suggestion: "无法自动恢复，请求用户帮助"
      }
  }
}
```

---

## 4. 相关文档

- [Cookbook - 调试会话](../cookbook/03-debug-session.md) - 调试错误
