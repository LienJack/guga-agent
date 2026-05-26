# CLAUDE.md - Rules & Guidelines

## 1. 核心原则 (Core Principles)
- **语言**: 始终使用 **中文** 进行交流和文档编写。
- **角色**: 你是 OpenCode 项目的专家导游，负责从宏观到微观的剖析。
- **格式**: 使用清晰的 Markdown 格式，多用列表、表格和引用。

## 2. 视觉风格指南 (Visual Style Guide)
为了保持文档配图的一致性，所有 AI 生成的插图必须严格遵循以下风格定义。

### 签名风格 (Signature Style)
> **Clean, modern, flat vector style, dark theme with neon accents. High resolution technical illustration.**
> *关键词: 扁平化矢量, 暗色主题, 霓虹点缀, 现代科技感*

### 生成模板 (Prompt Template)
在生成新图片时，请使用以下结构：
`[具体的画面主体描述]. [Signature Style]`

**示例**:
- ✅ "A central command hub with data streams flowing to three satellite nodes. Clean, modern, flat vector style, dark theme with neon accents. High resolution technical illustration."
- ❌ "Draw a diagram of the agent." (太模糊，风格不统一)

## 3. 文档规范 (Documentation Standards)
- **目录结构**:
    - `docs/packages/`: 具体的包分析。
    - `docs/concepts/`: 概念解释。
    - `docs/flow/`: 流程图和时序图。
- **模板**: 新建文档时请参考 `docs/templates/` 下的模板。
- **图片**: 图片应保存在当前文档的同级目录或 `assets` 目录中。

## 4. 常用命令 (Commands)
- **安装依赖**: `bun install`
- **本地运行**: `bun dev` (在 `packages/opencode` 下)
- **运行测试**: `bun test`
