# 包分析: enterprise

## 1. 概览 (Overview)

- **路径**: `packages/enterprise`
- **定位**: OpenCode 企业版 SaaS 平台
- **技术栈**: SolidStart + SolidJS + Nitro
- **部署**: Cloudflare Workers / Node.js

---

## 2. 架构

Enterprise 包是一个基于 SolidStart 的全栈应用，提供企业级功能：

- 🔐 团队管理
- 👥 用户权限控制
- 📊 使用统计和分析
- 💰 计费和订阅
- 🔄 多租户支持

---

## 3. 核心依赖

```json
{
  "@solidjs/start": "catalog:",
  "@solidjs/router": "catalog:",
  "@opencode-ai/ui": "workspace:*",
  "@opencode-ai/util": "workspace:*",
  "hono": "catalog:",
  "nitro": "3.0.1-alpha.1"
}
```

---

## 4. 部署选项

### 4.1 Cloudflare Workers

```bash
bun run build:cloudflare
```

### 4.2 Node.js

```bash
bun run build
bun run start
```

---

## 5. 开发

```bash
cd packages/enterprise
bun install
bun dev
```

---

## 6. 相关文档

- [Console 包](../console/README.md) - 管理后台
- [App 包](../app/README.md) - 前端应用
- [UI 包](../ui/README.md) - 组件库

---

**注**: Enterprise 功能为商业功能，详细文档请参考官方企业版文档。
