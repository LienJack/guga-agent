# 权限流程 (Permission Flow)

> 工具执行前的权限检查和用户授权流程。

---

## 1. 权限检查流程

**权限检查执行步骤**:

1. **Agent 调用工具** → 触发权限检查
2. **检查权限配置**:
   - `allow` → 直接执行工具
   - `deny` → 拒绝执行并记录
   - `ask` → 请求用户授权
3. **用户授权**（如果需要）:
   - 用户选择 `allow` → 执行工具
   - 用户选择 `deny` → 拒绝执行
4. **记录结果** → 记录执行或拒绝的详情
5. **通知 Agent** → 将结果返回给 LLM

---

## 2. 权限规则匹配

### 2.1 规则优先级

权限规则按以下顺序匹配：

```
1. Agent 配置中的具体工具规则
   agent.build.permission.read

2. Agent 配置中的通配符规则
   agent.build.permission."*"

3. 全局默认规则
   permission."*"

4. 硬编码拒绝
   默认拒绝未配置的操作
```

### 2.2 参数匹配

某些权限规则需要匹配参数：

```typescript
// 配置示例
{
  "permission": {
    "bash": {
      "command": {
        "rm -rf node_modules": "allow",  // 允许特定命令
        "*": "deny"                      // 拒绝其他命令
      }
    },
    "read": {
      "filePath": {
        "src/**/*": "allow",             // 允许读取 src 目录
        "*.env": "deny"                  // 拒绝读取 .env 文件
      }
    }
  }
}
```

---

## 3. 用户授权流程

### 3.1 创建权限请求

```typescript
export async function requestPermission(
  toolID: string,
  args: Record<string, any>
): Promise<"allow" | "deny"> {
  // 1. 生成请求 ID
  const requestID = crypto.randomUUID()
  
  // 2. 存储请求
  await PermissionRequests.create({
    id: requestID,
    toolID,
    args,
    status: "pending",
    createdAt: new Date()
  })
  
  // 3. 发送事件
  Bus.emit("permission.asked", {
    requestID,
    toolID,
    args,
    metadata: extractMetadata(toolID, args)
  })
  
  // 4. 等待响应（带超时）
  const response = await waitForResponse(requestID, 60000) // 60秒
  
  return response
}
```

### 3.2 处理用户响应

```typescript
export async function handlePermissionResponse(
  requestID: string,
  response: "allow" | "deny" | "always" | "reject"
): Promise<void> {
  // 1. 更新请求状态
  await PermissionRequests.update(requestID, {
    status: response === "allow" || response === "always" ? "approved" : "rejected",
    reply: response,
    respondedAt: new Date()
  })
  
  // 2. 如果选择 "always"，添加到权限配置
  if (response === "always") {
    const request = await PermissionRequests.get(requestID)
    await addAlwaysAllowRule(request.toolID, request.args)
  }
  
  // 3. 通知等待的 Promise
  resolveResponse(requestID, response)
}
```

---

## 4. 权限缓存

为了避免重复询问，OpenCode 会缓存权限决策：

```typescript
const permissionCache = new Map<string, PermissionDecision>()

export function getCachedDecision(
  toolID: string,
  args: Record<string, any>
): PermissionDecision | undefined {
  const cacheKey = `${toolID}:${JSON.stringify(args)}`
  return permissionCache.get(cacheKey)
}

export function setCachedDecision(
  toolID: string,
  args: Record<string, any>,
  decision: "allow" | "deny"
): void {
  const cacheKey = `${toolID}:${JSON.stringify(args)}`
  permissionCache.set(cacheKey, {
    decision,
    timestamp: Date.now()
  })
}
```

---

## 5. 相关文档

- [权限系统](../internals/permission.md) - 权限配置详解
- [工具执行流程](./tool_execution.md) - 完整工具执行流程
