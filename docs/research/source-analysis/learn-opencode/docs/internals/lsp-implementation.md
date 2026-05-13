# LSP 实现细节 (LSP Implementation)

> OpenCode 的 Language Server Protocol 客户端实现。

---

## 1. 概览

- **路径**: `packages/opencode/src/lsp/`
- **定位**: LSP 客户端，提供代码智能功能
- **核心职责**:
  - 管理语言服务器生命周期
  - 提供代码补全、跳转、诊断等功能
  - 将 LSP 能力暴露为工具

---

## 2. 支持的功能

| 功能 | 说明 | 工具名 |
|------|------|--------|
| **Hover** | 获取类型信息 | `lsp_hover` |
| **Goto Definition** | 跳转到定义 | `lsp_goto_definition` |
| **Find References** | 查找引用 | `lsp_find_references` |
| **Diagnostics** | 获取错误和警告 | `lsp_diagnostics` |
| **Code Actions** | 获取快速修复 | `lsp_code_actions` |
| **Rename** | 重命名符号 | `lsp_rename` |

---

## 3. LSP 工具实现

```typescript
// src/tool/lsp.ts
export const LspTool: Tool.Info = {
  id: "lsp",
  init: async (initCtx) => ({
    description: "LSP 代码智能功能",
    parameters: z.object({
      operation: z.enum(["hover", "goto_definition", "find_references"]),
      filePath: z.string(),
      line: z.number(),
      character: z.number()
    }),
    
    async execute(args, ctx) {
      const lspClient = await LSP.getClient(args.filePath)
      
      switch (args.operation) {
        case "hover":
          return await lspClient.hover({
            filePath: args.filePath,
            position: { line: args.line, character: args.character }
          })
        
        case "goto_definition":
          return await lspClient.gotoDefinition({
            filePath: args.filePath,
            position: { line: args.line, character: args.character }
          })
        
        case "find_references":
          return await lspClient.findReferences({
            filePath: args.filePath,
            position: { line: args.line, character: args.character }
          })
      }
    }
  })
}
```

---

## 4. LSP 客户端管理

```typescript
// src/lsp/client.ts
export namespace LSP {
  // 每个文件类型对应一个 LSP Server
  const clients = new Map<string, LSPClient>()
  
  export async function getClient(filePath: string): Promise<LSPClient> {
    const fileType = getFileType(filePath)
    
    if (clients.has(fileType)) {
      return clients.get(fileType)!
    }
    
    // 启动新的 LSP Server
    const client = await startLSPServer(fileType)
    clients.set(fileType, client)
    
    return client
  }
  
  async function startLSPServer(fileType: string): Promise<LSPClient> {
    const config = LSP_SERVER_CONFIGS[fileType]
    
    const server = spawn(config.command, config.args)
    const client = new LSPClient(server)
    
    await client.initialize()
    
    return client
  }
}
```

---

## 5. 配置

```typescript
const LSP_SERVER_CONFIGS = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"]
  },
  python: {
    command: "pylsp",
    args: []
  },
  rust: {
    command: "rust-analyzer",
    args: []
  }
}
```

---

## 6. 相关文档

- [LSP 协议](../concepts/lsp.md) - 协议概念
- [工具系统](./tool.md) - 工具注册机制
