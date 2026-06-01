# docs: write Chinese README and mascot logo

## Goal

为 Guga Agent 新建中文、英文、日语 README，清楚说明它是什么、解决什么问题、设计哲学和当前功能，并加入一个参考用户给定角色生成的像素风吉祥物 logo。三个 README 之间需要能互相切换。

## What I Already Know

- 用户要求新建分支完成 README。
- README 需要中文版本，首要内容包括：Guga Agent 是什么、解决什么问题、设计哲学、功能。
- 用户给定角色图，要求吉祥物 logo 使用该角色的像素风风格。
- 用户补充希望参考 pi agent、opencode 等项目的 README。
- 用户补充要求编写英文和日语 README，并且可以在 README 中切换。
- 当前项目已有 `STRATEGY.md`，将 Guga Agent 定位为商业级 agent runtime 蓝图。
- 当前 monorepo 包包括 core、AI SDK provider bridge、filesystem/shell/git tools、JSONL session store、artifact filesystem、replay audit、default context policy。

## Assumptions

- 根目录当前没有 README，本任务创建 `README.md` 作为中文主 README。
- 英文 README 使用 `README.en.md`，日语 README 使用 `README.ja.md`。
- 参考 pi/opencode README 时只借结构与表达节奏，不复制项目定位或具体安装方式。
- logo 资产以 PNG 保存到仓库，并在 README 首屏居中展示。

## Requirements

- README 用中文撰写。
- 新增英文和日语 README。
- 中文、英文、日语 README 顶部提供语言切换链接。
- README 首屏包含 logo、项目名和一句话定位。
- README 解释：
  - Guga Agent 是什么。
  - 它解决什么问题。
  - 设计哲学。
  - 当前功能与包结构。
  - 快速开始/开发命令。
  - 与 Claude Code / OpenCode 类 coding agent 的差异。
- README 应真实反映当前实现阶段，避免夸大成已完整产品。
- 像素风 logo 需要基于用户给定角色风格，保存为项目资产并引用。
- 项目使用 Apache License 2.0，并在 README、仓库许可证文件和根包元数据中声明。

## Acceptance Criteria

- [ ] `README.md` 存在且为中文。
- [ ] `README.en.md` 存在且为英文。
- [ ] `README.ja.md` 存在且为日语。
- [ ] 三个 README 顶部都有语言切换链接。
- [ ] README 包含 logo 引用，路径指向仓库内资产。
- [ ] README 内容覆盖是什么、解决什么问题、设计哲学、功能。
- [ ] README 提到当前包和开发命令。
- [ ] 仓库包含 Apache License 2.0 许可证文件，并在 README 中引用。
- [ ] 参考 pi/opencode README 的结构，但不直接照搬。
- [ ] 运行合适的文档/文件检查，确认链接路径和 Markdown 基本可读。

## Definition Of Done

- 文档和资产已写入当前分支。
- `git diff` 检查过。
- 如有可运行的轻量检查，已执行并记录结果。

## Out Of Scope

- 不发布 npm 包。
- 不新增真实 CLI 安装脚本。
- 不实现 README 中提到的未来功能。
- 不发布多语言文档站点。

## Technical Notes

- 参考资料：
  - `STRATEGY.md`
  - `docs/roadmap.md`
  - `packages/core/README.md`
  - first-party plugin READMEs
  - `docs/research/repomix/pi-focused-context.xml` 中的 pi root README
  - `docs/research/repomix/opencode-context.1.xml` 中的 opencode root README / README.zh.md
- 生成 logo 使用 built-in image generation，输入图作为风格参考；最终去背景 PNG 保存到 `assets/guga-mascot-pixel.png`。
