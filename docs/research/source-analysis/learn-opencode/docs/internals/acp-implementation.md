# ACP 实现细节 (ACP Implementation)

> OpenCode 作为 ACP Server 的完整实现。

---

## 1. 概览

- **路径**: `packages/opencode/src/acp/`
- **定位**: Agent Context Protocol 服务器实现
- **核心职责**:
  - 响应 IDE 的 ACP 请求
  - 管理 ACP 会话
  - 转发事件给 IDE

---

## 2. 核心实现

参考 [ACP 协议](../concepts/acp.md) 中的详细实现说明。

### 2.1 ACP Agent

```typescript
// src/acp/agent.ts
export class Agent implements ACPAgent {
  private connection: AgentSideConnection
  private sdk: OpencodeClient
  
  async initialize(req: InitializeRequest) {
    return {
      capabilities: {
        supportsCancellation: true,
        supportsSetSessionModel: true
      },
      agentInfo: {
        name: "OpenCode",
        version: Installation.VERSION
      }
    }
  }
  
  async newSession(req: NewSessionRequest) {
    const session = await this.sdk.session.create({
      title: `ACP Session`,
      directory: req.cwd
    })
    
    return session.id
  }
  
  async prompt(req: PromptRequest) {
    await this.sdk.session.prompt({
      sessionID: req.sessionId,
      directory: req.cwd,
      parts: [{ type: "text", text: req.prompt }]
    })
  }
}
```

### 2.2 事件转发

```typescript
// 订阅 OpenCode 事件并转发给 IDE
async setupEventSubscriptions(sessionId: string) {
  const events = await this.sdk.event.subscribe({
    directory: session.cwd
  })
  
  for await (const event of events.stream) {
    switch (event.type) {
      case "permission.asked":
        await this.connection.requestPermission({
          sessionId,
          toolCall: mapToACPToolCall(event.properties)
        })
        break
      
      case "message.part.updated":
        await this.connection.reportProgress({
          sessionId,
          progress: mapToACPProgress(event.properties)
        })
        break
    }
  }
}
```

---

## 3. 启动 ACP 模式

```bash
opencode acp
```

输出 JSON-RPC 端口供 IDE 连接。

---

## 4. 相关文档

- [ACP 协议](../concepts/acp.md) - 完整协议文档（652行详细说明）
- [Session 模块](./session.md) - 会话管理
- [Bus 模块](./bus.md) - 事件总线
