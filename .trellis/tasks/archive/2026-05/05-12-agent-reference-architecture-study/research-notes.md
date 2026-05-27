# 研究笔记

## Source Contract

- 来源类型：本地路径
- 版本锚点：当前本地工作树，具体 commit 后续用 `git rev-parse HEAD` 记录
- 访问约束：本机可读
- 灵感范围：多项目比较设计参考，用于抽取从 0 到 1 构建 agent 的架构模式

## Style Contract

- 读者：希望设计/实现 agent 的工程师、TL、架构师
- 语气：克制、清晰、有判断，既解释机制也指出代价
- 密度：每节有明确论点，不做目录复述
- 证据：关键判断携带真实代码路径，必要时标注 Fact / Inference / Pending Verification
- 禁止：模板腔、流水账、只复述 README、无证据赞美

## 初始边界

本轮重点研究 agent 主循环、提示词、上下文、工具、模型接入、前端/协议协同。暂不深挖发行工程、测试基建、UI 视觉、文档站、供应链 vendored 代码。
