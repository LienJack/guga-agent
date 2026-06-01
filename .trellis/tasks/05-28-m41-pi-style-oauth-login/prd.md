# Implement Pi-style Copilot and Codex OAuth login

执行来源：`docs/plans/2026-05-28-041-feat-pi-style-copilot-codex-oauth-login-plan.md`

目标是在现有 M40 provider/auth/model registry 与 M42 Ink workbench 基础上，交付 Guga-owned OAuth session 层，让 GitHub Copilot 与 OpenAI/Codex 支持登录、存储、刷新、登出、auth-aware 模型可用性和 runtime 调用。

边界以计划文档为准：不实现 DeepSeek/Kimi OAuth；不承诺 consumer Claude OAuth；不复用外部 CLI credential store；不把 provider-specific OAuth payload 暴露到 core contracts。

验收以计划中的 AE1-AE7 与 U1-U8 Verification 为准，正常测试必须 hermetic，真实网络 smoke 只能显式 opt-in。
