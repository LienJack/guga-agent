<p align="center">
  <img src="assets/guga-mascot-pixel.png" alt="Guga Agent pixel-art mascot" width="180">
</p>

<h1 align="center">Guga Agent</h1>

<p align="center">
  A small-core, plugin-first, recoverable, auditable, embeddable Agent Runtime.
</p>

<p align="center">
  <a href="README.md">简体中文</a> |
  <a href="README.en.md">English</a> |
  <a href="README.ja.md">日本語</a>
</p>

---

## What Is Guga Agent

Guga Agent is a TypeScript runtime monorepo for builders of agent products. It does not start as a large chat application that later gets split into an SDK. Instead, it starts with the load-bearing parts of real agent systems: model calls, tool execution, permissions, context, events, plugins, session storage, artifacts, and replay all live behind clear runtime boundaries.

In one sentence: Guga Agent helps turn a working agent demo into an agent system that can be shipped, recovered, audited, and embedded in real products.

## What Problems It Solves

Many agent prototypes look like "a model plus tools", but the same problems appear as soon as they touch real workflows:

- Long tasks hit context overflow, and it is unclear whether the agent can continue safely after compaction.
- Tools can read files, write files, and execute commands, but permissions, audit trails, and result feedback are scattered.
- Provider SDK types leak into the main loop, making model switching, retry, and fallback global concerns.
- UI, CLI, IDE, and API clients all want to observe the same run, but each ends up parsing strings and temporary state.
- Sessions survive only in memory, making crashes, cancellation, restart, branching, and replay fragile.
- More plugins and tools keep getting added, but order, namespaces, permissions, and stale context are not governed consistently.

Guga's answer is to move these concerns into the runtime: the model proposes intent, the runtime owns execution boundaries; context is a projection, not the only source of truth; events are the ledger that UI and audit views derive from.

## Design Philosophy

### Small Core, Large Periphery

`@guga-agent/core` owns only the agent lifecycle, state machine, events, hooks, capability registration, permission protocol, tool execution pipeline, and core contracts. Real providers, filesystem access, shell execution, git helpers, session stores, artifact stores, and context policies connect as plugins.

### Plugins Are First-Class

First-party capabilities and host-defined capabilities use the same plugin context: register providers, tools, hooks, stores, or context policies. Plugins cannot mutate core state directly; they participate through explicit capability registration and typed hook results.

### Events Are The Source Of Facts

Model requests, tool calls, permission decisions, hook decisions, usage, artifacts, errors, compaction boundaries, and replay hints should all become recordable facts. The final answer is only the result; the event ledger is the foundation for recovery and audit.

### Permissions Are Enforced By Runtime

The model can explain why it wants to perform an action, but it cannot authorize itself. Every tool intent goes through `ExecutionPipeline`: schema checks, hooks, permission resolution, scheduling, timeout, result policy, and event recording.

### Context Is A Projection

Model input is not an ever-growing concatenation of history. It is projected from conversation state, context sources, artifact references, compaction boundaries, and policy. Summaries extend endurance; they are not the only source of truth.

### Commercial Capability Grows Gradually

Guga does not try to build a full marketplace, long-term memory, multi-agent swarm, or enterprise console on day one. It first stabilizes loop, tool, provider, context, session, and replay boundaries, then lets product capabilities grow through the plugin ecosystem.

## Current Capabilities

| Capability | Package | Description |
| --- | --- | --- |
| Core Runtime | `@guga-agent/core` | Provider-neutral messages, `AgentLoop`, `ConversationState`, `CapabilityRegistry`, `EventBus`, `ProviderRouter`, hook contracts, permissions, tool execution pipeline, and result policy. |
| AI SDK Provider Bridge | `@guga-agent/provider-ai-sdk` | Maps Vercel AI SDK providers into Guga provider runtime contracts; supports `gateway`, `openai-compatible`, `openai`, and `anthropic` modes. |
| Filesystem Tools | `@guga-agent/plugin-tools-filesystem` | Registers `fs_read`, `fs_write`, `fs_edit`, `fs_list`, and `fs_search`, with realpath containment to prevent workspace escapes. |
| Shell Tool | `@guga-agent/plugin-tools-shell` | Registers `shell_exec`; ask-by-default, serial-only, environment-limited, with a replaceable sandbox backend. |
| Git Tools | `@guga-agent/plugin-tools-git` | Provides safe helpers such as `git_status`, `git_diff`, and `git_commit_message`; it does not expose push, reset, rebase, or history rewrite automation. |
| JSONL Session Store | `@guga-agent/plugin-session-jsonl` | Local-first append-only event/session store with revision checks, idempotency, hash-chain continuity, and corruption diagnostics. |
| Artifact Store | `@guga-agent/plugin-artifact-filesystem` | Stores large tool outputs and replay artifacts in the filesystem while events keep bounded previews and verifiable references. |
| Replay Audit | `@guga-agent/plugin-replay-audit` | Derives conversation, model-input, and audit timelines from durable facts without rerunning providers, tools, or mutating hooks. |
| Default Context Policy | `@guga-agent/plugin-context-default` | Registers the default context policy and hooks for resources, assemble, budget, truncate, compact, and reinject phases. |

## Usage

This repository is currently closer to a runtime/workbench foundation than a published terminal application. Development and verification start with the monorepo commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

A minimal host usually creates a runtime, mounts a provider and plugins, then runs a turn:

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createAiSdkProviderPlugin } from "@guga-agent/provider-ai-sdk";
import { createFilesystemPlugin } from "@guga-agent/plugin-tools-filesystem";
import { createJsonlSessionPlugin } from "@guga-agent/plugin-session-jsonl";

const runtime = createAgentRuntime({
  plugins: [
    createAiSdkProviderPlugin({
      id: "local-provider",
      mode: "openai-compatible",
      modelId: "local-model",
      baseURL: "http://localhost:11434/v1",
      apiKey: "test",
      metadata: {
        purposes: ["primary"],
        capabilities: { toolCalling: true, usage: "optional" }
      }
    }),
    createFilesystemPlugin({ workspaceRoot: process.cwd() }),
    createJsonlSessionPlugin({ rootDir: ".guga/sessions" })
  ]
});
```

## Relationship To OpenCode And Pi Agent

Guga learns from mature open-source agent projects, but it has a different product center of gravity:

- OpenCode is closer to a complete open-source coding agent product, with emphasis on TUI, client/server architecture, multi-provider support, and direct user experience.
- Pi Agent is closer to a self-extensible agent harness, with emphasis on monorepo structure, runtime, extensions, sessions, and the data flywheel.
- Guga aims to provide a runtime foundation for agent product builders. It prioritizes embeddable runtime boundaries so CLI, Web, IDE, worker, and enterprise console surfaces can share the same source of runtime facts.

## Roadmap Direction

- Stabilize the core runtime, provider bridge, tool pipeline, permission kernel, and event facts.
- Strengthen context projection, tool result budgeting, compaction boundaries, and session resume.
- Improve the local plugin host and evolve toward manifests, namespaces, reload, and stale context guards.
- Add skills, MCP, eval, multi-agent delegation, UI projection, and operations-layer capabilities.
- Move into model operations, cost tracking, credential pools, remote sandboxes, and enterprise policy after real provider and real task pressure.

## Current Status

Guga Agent is still in the early runtime architecture stage. It already has foundational packages for core contracts, first-party provider bridging, tool plugins, JSONL sessions, artifacts, and replay audit, but it is not yet a complete out-of-the-box coding agent application.

If you want to build on it, treat it as an agent runtime foundation rather than a simple chat UI wrapper.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
