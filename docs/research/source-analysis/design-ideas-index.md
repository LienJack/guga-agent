# Design Ideas Index

Use this file when the question is about design philosophy, architectural tradeoffs, or subsystem patterns. The links point to the most useful starting files; follow local cross-links inside each corpus for detail.

## High-Level Architecture

Start here for "what is the system trying to be?" and "where are the boundaries?"

- [Claude Code architecture overview](./claude-code-analysis/analysis/01-architecture-overview.md)
- [Claude Code differentiators and comparison](./claude-code-analysis/analysis/05-differentiators-and-comparison.md)
- [Claude Code final summary](./claude-code-analysis/analysis/09-final-summary.md)
- [DeerFlow: what it is](./deerflow-book/chapters/01-what-is-deerflow.md)
- [DeerFlow repo overview](./deerflow-book/chapters/02-repo-overview.md)
- [Hermes full picture](./hermes-agent-anatomy/docs/01-全景图.md)
- [Hermes three-way comparison](./hermes-agent-anatomy/docs/08-三方对比.md)
- [Hermes CLI architecture](./hermes-wiki/concepts/cli-architecture.md)
- [Learn OpenCode system architecture](./learn-opencode/docs/architecture/README.md)
- [Learn OpenCode package overview](./learn-opencode/docs/packages/opencode/README.md)
- [Learn OpenCode docs index](./learn-opencode/docs/index.md)

## Agent Loop And Orchestration

Use these for run-loop shape, turn lifecycle, graph/middleware flow, and how control returns from tools to the model.

- [Claude Code component architecture](./claude-code-analysis/analysis/components/01-component-architecture-overview.md)
- [Claude Code core interaction components](./claude-code-analysis/analysis/components/02-core-interaction-components.md)
- [Claude Code function-level core walkthrough](./claude-code-analysis/analysis/components/05-function-level-core-walkthrough.md)
- [DeerFlow LangGraph engine](./deerflow-book/chapters/04-langgraph-engine.md)
- [DeerFlow lead agent](./deerflow-book/chapters/05-lead-agent.md)
- [DeerFlow middleware pipeline](./deerflow-book/chapters/06-middleware-pipeline.md)
- [Hermes agent core loop](./hermes-agent-anatomy/docs/02-Agent核心循环.md)
- [Hermes agent loop and prompt assembly](./hermes-wiki/concepts/agent-loop-and-prompt-assembly.md)
- [Hermes AIAgent class](./hermes-wiki/entities/aiagent-class.md)
- [Learn OpenCode agent internals](./learn-opencode/docs/internals/agent.md)
- [Learn OpenCode agent lifecycle](./learn-opencode/docs/flow/agent_lifecycle.md)
- [Learn OpenCode run flow](./learn-opencode/docs/packages/opencode/README.md)

## Context, Compression, And Session Recovery

Use these for context budget policy, compaction, session splitting, resume, history search, and preserving tool-call integrity.

- [Claude Code context management](./claude-code-analysis/analysis/04f-context-management.md)
- [Claude Code prompt management](./claude-code-analysis/analysis/04g-prompt-management.md)
- [Claude Code session storage and resume](./claude-code-analysis/analysis/04i-session-storage-resume.md)
- [DeerFlow context engineering](./deerflow-book/chapters/07-context-engineering.md)
- [Hermes context compression](./hermes-agent-anatomy/docs/05-上下文压缩.md)
- [Hermes context compressor architecture](./hermes-wiki/concepts/context-compressor-architecture.md)
- [Hermes context references](./hermes-wiki/concepts/context-references.md)
- [Hermes large tool result handling](./hermes-wiki/concepts/large-tool-result-handling.md)
- [Hermes session search and SessionDB](./hermes-wiki/concepts/session-search-and-sessiondb.md)
- [Learn OpenCode session internals](./learn-opencode/docs/internals/session.md)
- [Learn OpenCode state sync flow](./learn-opencode/docs/flow/state_sync.md)

## Tools, MCP, Skills, And Extension Design

Use these for extension boundaries, progressive disclosure, tool registry shape, dynamic schemas, and plugin/MCP integration.

- [Claude Code tool-call implementation](./claude-code-analysis/analysis/04b-tool-call-implementation.md)
- [Claude Code skills implementation](./claude-code-analysis/analysis/04c-skills-implementation.md)
- [Claude Code MCP implementation](./claude-code-analysis/analysis/04d-mcp-implementation.md)
- [Claude Code code evidence index](./claude-code-analysis/analysis/07-code-evidence-index.md)
- [DeerFlow builtin tools](./deerflow-book/chapters/15-builtin-tools.md)
- [DeerFlow MCP extensions](./deerflow-book/chapters/16-mcp-extensions.md)
- [DeerFlow skills system](./deerflow-book/chapters/17-skills-system.md)
- [DeerFlow custom skills](./deerflow-book/chapters/18-custom-skills.md)
- [Hermes tool registry](./hermes-agent-anatomy/docs/03-Tool-Registry.md)
- [Hermes tool registry architecture](./hermes-wiki/concepts/tool-registry-architecture.md)
- [Hermes model-tools dispatch](./hermes-wiki/concepts/model-tools-dispatch.md)
- [Hermes MCP and plugins](./hermes-wiki/concepts/mcp-and-plugins.md)
- [Hermes skills system architecture](./hermes-wiki/concepts/skills-system-architecture.md)
- [Hermes toolsets system](./hermes-wiki/concepts/toolsets-system.md)
- [Learn OpenCode tool internals](./learn-opencode/docs/internals/tool.md)
- [Learn OpenCode tool execution flow](./learn-opencode/docs/flow/tool_execution.md)
- [Learn OpenCode tools and capabilities](./learn-opencode/docs/packages/opencode/03-tools-and-capabilities.md)
- [Learn OpenCode MCP concept](./learn-opencode/docs/concepts/mcp.md)
- [Learn OpenCode MCP implementation](./learn-opencode/docs/internals/mcp-implementation.md)
- [Learn OpenCode plugin package](./learn-opencode/docs/packages/plugin/README.md)
- [Learn OpenCode plugin loading flow](./learn-opencode/docs/flow/plugin_loading.md)
- [Learn OpenCode skill internals](./learn-opencode/docs/internals/skill.md)

## Multi-Agent And Delegation

Use these for subagent isolation, coordinator modes, teammate/team abstractions, trace propagation, and parallel work routing.

- [Claude Code multi-agent mechanism](./claude-code-analysis/analysis/04h-multi-agent.md)
- [DeerFlow subagent overview](./deerflow-book/chapters/08-subagent-overview.md)
- [DeerFlow subagent executor](./deerflow-book/chapters/09-subagent-executor.md)
- [DeerFlow orchestration](./deerflow-book/chapters/10-orchestration.md)
- [Hermes multi-agent architecture](./hermes-wiki/concepts/multi-agent-architecture.md)
- [Hermes parallel tool execution](./hermes-wiki/concepts/parallel-tool-execution.md)
- [Hermes interrupt and fault tolerance](./hermes-wiki/concepts/interrupt-and-fault-tolerance.md)
- [Learn OpenCode agents and permissions](./learn-opencode/docs/packages/opencode/01-agents-and-permissions.md)
- [Learn OpenCode custom agent cookbook](./learn-opencode/docs/cookbook/01-create-custom-agent.md)

## Memory, Learning, And Data Flywheel

Use these for memory files, profile/user facts, RL/training data, trajectory capture, and the difference between skill knowledge and durable memory.

- [Claude Code agent memory](./claude-code-analysis/analysis/04-agent-memory.md)
- [DeerFlow memory architecture](./deerflow-book/chapters/11-memory-architecture.md)
- [DeerFlow memory pipeline](./deerflow-book/chapters/12-memory-pipeline.md)
- [Hermes memory and RL training](./hermes-agent-anatomy/docs/07-Memory与RL训练.md)
- [Hermes memory system architecture](./hermes-wiki/concepts/memory-system-architecture.md)
- [Hermes MemoryStore class](./hermes-wiki/entities/memorystore-class.md)
- [Hermes skills and memory interaction](./hermes-wiki/concepts/skills-and-memory-interaction.md)
- [Hermes trajectory and data generation](./hermes-wiki/concepts/trajectory-and-data-generation.md)

## Provider, Model, And Transport Abstractions

Use these for model selection, provider routing, transport adapters, credential pools, pricing, and fallback chains.

- [DeerFlow model config](./deerflow-book/chapters/22-model-config.md)
- [Hermes multi-provider adaptation](./hermes-agent-anatomy/docs/04-多Provider适配.md)
- [Hermes provider transport architecture](./hermes-wiki/concepts/provider-transport-architecture.md)
- [Hermes auxiliary client architecture](./hermes-wiki/concepts/auxiliary-client-architecture.md)
- [Hermes smart model routing](./hermes-wiki/concepts/smart-model-routing.md)
- [Hermes credential pool and isolation](./hermes-wiki/concepts/credential-pool-and-isolation.md)
- [Hermes prompt caching optimization](./hermes-wiki/concepts/prompt-caching-optimization.md)
- [Learn OpenCode provider internals](./learn-opencode/docs/internals/provider.md)
- [Learn OpenCode config internals](./learn-opencode/docs/internals/config.md)

## Sandbox, Execution, And Work Isolation

Use these for filesystem/execution boundaries, virtual paths, terminal backends, browser tools, and worktree isolation.

- [Claude Code sandbox implementation](./claude-code-analysis/analysis/04e-sandbox-implementation.md)
- [DeerFlow sandbox abstraction](./deerflow-book/chapters/13-sandbox-abstraction.md)
- [DeerFlow sandbox implementations](./deerflow-book/chapters/14-sandbox-implementations.md)
- [Hermes code execution sandbox](./hermes-wiki/concepts/code-execution-sandbox.md)
- [Hermes terminal backends](./hermes-wiki/concepts/terminal-backends.md)
- [Hermes browser tool architecture](./hermes-wiki/concepts/browser-tool-architecture.md)
- [Hermes web tools architecture](./hermes-wiki/concepts/web-tools-architecture.md)
- [Hermes worktree isolation](./hermes-wiki/concepts/worktree-isolation.md)
- [Learn OpenCode PTY internals](./learn-opencode/docs/internals/pty.md)
- [Learn OpenCode project internals](./learn-opencode/docs/internals/project.md)
- [Learn OpenCode snapshot internals](./learn-opencode/docs/internals/snapshot.md)
- [Learn OpenCode snapshot rollback flow](./learn-opencode/docs/flow/snapshot_rollback.md)

## Security, Privacy, And Permission Boundaries

Use these for threat model, user data handling, privacy avoidance, permission prompts, sandbox defenses, and credential isolation.

- [Claude Code security analysis](./claude-code-analysis/analysis/02-security-analysis.md)
- [Claude Code user data and usage](./claude-code-analysis/analysis/02-user-data-and-usage.md)
- [Claude Code privacy avoidance](./claude-code-analysis/analysis/03-privacy-avoidance.md)
- [Claude Code negative keyword analysis](./claude-code-analysis/analysis/06b-negative-keyword-analysis.md)
- [Hermes security defense system](./hermes-wiki/concepts/security-defense-system.md)
- [Hermes credential pool and isolation](./hermes-wiki/concepts/credential-pool-and-isolation.md)
- [Hermes interrupt and fault tolerance](./hermes-wiki/concepts/interrupt-and-fault-tolerance.md)
- [Learn OpenCode permission internals](./learn-opencode/docs/internals/permission.md)
- [Learn OpenCode permission flow](./learn-opencode/docs/flow/permission_flow.md)
- [Learn OpenCode error handling flow](./learn-opencode/docs/flow/error_handling.md)

## Gateway, UI, Channels, And Product Surface

Use these for CLI/product UX, remote gateway, messaging channels, scheduling, hook systems, and user-facing platform boundaries.

- [Claude Code platform components](./claude-code-analysis/analysis/components/03-platform-components.md)
- [Claude Code function-level platform walkthrough](./claude-code-analysis/analysis/components/06-function-level-platform-walkthrough.md)
- [Claude Code hidden features and flags](./claude-code-analysis/analysis/11-hidden-features-and-easter-eggs.md)
- [DeerFlow FastAPI gateway](./deerflow-book/chapters/19-fastapi-gateway.md)
- [DeerFlow IM channels](./deerflow-book/chapters/20-im-channels.md)
- [Hermes messaging gateway](./hermes-agent-anatomy/docs/06-消息网关.md)
- [Hermes gateway session management](./hermes-wiki/concepts/gateway-session-management.md)
- [Hermes messaging gateway architecture](./hermes-wiki/concepts/messaging-gateway-architecture.md)
- [Hermes hook system architecture](./hermes-wiki/concepts/hook-system-architecture.md)
- [Hermes cron scheduling](./hermes-wiki/concepts/cron-scheduling.md)
- [Hermes configuration and profiles](./hermes-wiki/concepts/configuration-and-profiles.md)
- [Hermes skin engine](./hermes-wiki/concepts/skin-engine.md)
- [Learn OpenCode CLI internals](./learn-opencode/docs/internals/cli.md)
- [Learn OpenCode server internals](./learn-opencode/docs/internals/server.md)
- [Learn OpenCode bus internals](./learn-opencode/docs/internals/bus.md)
- [Learn OpenCode ACP concept](./learn-opencode/docs/concepts/acp.md)
- [Learn OpenCode ACP implementation](./learn-opencode/docs/internals/acp-implementation.md)
- [Learn OpenCode LSP concept](./learn-opencode/docs/concepts/lsp.md)
- [Learn OpenCode LSP implementation](./learn-opencode/docs/internals/lsp-implementation.md)
- [Learn OpenCode SDK package](./learn-opencode/docs/packages/sdk/README.md)
- [Learn OpenCode UI package](./learn-opencode/docs/packages/ui/README.md)
- [Learn OpenCode app package](./learn-opencode/docs/packages/app/README.md)
- [Learn OpenCode desktop package](./learn-opencode/docs/packages/desktop/README.md)
- [Learn OpenCode VS Code integration](./learn-opencode/docs/editors/vscode.md)

## Productionization And Operations

Use these for deployment, configuration, observability, scaling, and operational resilience.

- [DeerFlow config system](./deerflow-book/chapters/21-config-system.md)
- [DeerFlow deployment](./deerflow-book/chapters/23-deployment.md)
- [DeerFlow config reference](./deerflow-book/chapters/appendix-b-config-reference.md)
- [Hermes interrupt and fault tolerance](./hermes-wiki/concepts/interrupt-and-fault-tolerance.md)
- [Hermes configuration and profiles](./hermes-wiki/concepts/configuration-and-profiles.md)
- [Hermes gateway session management](./hermes-wiki/concepts/gateway-session-management.md)
- [Learn OpenCode GitHub Action integration](./learn-opencode/docs/integrations/github-action.md)
- [Learn OpenCode utilities internals](./learn-opencode/docs/internals/utilities.md)

## Comparison And Decision Support

Use these when deciding what Guga Agent should adopt, avoid, or postpone.

- [Claude Code competitive comparison](./claude-code-analysis/analysis/08-competitive-comparison.md)
- [Claude Code reference comparison sources](./claude-code-analysis/analysis/08-reference-comparison-sources.md)
- [Claude Code extra findings](./claude-code-analysis/analysis/06-extra-findings.md)
- [Hermes three-way comparison](./hermes-agent-anatomy/docs/08-三方对比.md)
- [DeerFlow reading path](./deerflow-book/chapters/appendix-a-reading-path.md)
- [Learn OpenCode learning paths](./learn-opencode/docs/learning_paths.md)
- [Learn OpenCode audit report](./learn-opencode/docs/AUDIT_REPORT.md)

## Suggested Query Prompts

- "基于 `docs/research/source-analysis/design-ideas-index.md`，比较 Claude Code、DeerFlow、Hermes 在上下文压缩上的设计理念。"
- "先读 source-analysis 的工具/Skills/MCP 章节，提炼 Guga Agent 可采用的扩展边界。"
- "参考 source-analysis 的 Multi-Agent 部分，给 Guga Agent 设计一个最小可实现的 subagent 模型。"
- "从 security/privacy 主题出发，总结哪些设计应该作为 Guga Agent 的默认安全边界。"
