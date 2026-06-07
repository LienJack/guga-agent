import { describe, expect, it } from "vitest";
import {
  ContextSourceKind,
  ContextSourcePriority,
  type ContextPolicy,
  type ModelInputProjection
} from "./context";
import { AgentEventType, type AgentEvent } from "./events";
import {
  HookEffect,
  HookPhase,
  type ModelRequestPatch,
  type ModelResponseAnnotation,
  type ToolHookDecision,
  type PreToolGateDecision
} from "./hooks";
import { ModelEventType, type ModelEvent } from "./model-events";
import type { CoreMessage, ToolCall } from "./messages";
import type {
  AuditSummary,
  CredentialConfigView,
  MetricsSnapshot,
  ProviderHealth,
  TrustDescriptor
} from "./operations";
import type { CapabilityDescriptor, ExtensionSpecMetadata, LocalPlugin } from "./plugins";
import {
  ProviderErrorCategory,
  type ModelMetadata,
  type ProviderError,
  type ProviderResponse,
  type Usage
} from "./provider";
import type { PermissionPolicy, PermissionRequest } from "./permissions";
import type {
  ArtifactReference,
  ArtifactStore,
  DurableEventEnvelope,
  EventStore,
  ReplayCapability,
  SessionBranch,
  SessionStore
} from "./persistence";
import type {
  ToolActionMetadata,
  ToolCapabilityLease,
  ToolCredentialBinding,
  ToolEnvironmentAssessment,
  ToolIntent,
  ToolMetadataEvalHints,
  ToolPrincipalSummary,
  ToolProjection,
  ToolResourceScope,
  ToolSandboxRequirement
} from "./tool-runtime";
import type { ToolDefinition, ToolResult } from "./tools";
import type { AgentRunOptions, AgentRuntimeOptions } from "./runtime";
import type {
  DurableEventEnvelope as PublicDurableEventEnvelope,
  EventStore as PublicEventStore,
  ResumeReport as PublicResumeReport
} from "../index";
import type {
  ToolActionMetadata as PublicToolActionMetadata,
  ToolCredentialBinding as PublicToolCredentialBinding,
  ToolMetadataEvalHints as PublicToolMetadataEvalHints,
  ToolSandboxRequirement as PublicToolSandboxRequirement
} from "../index";

describe("core contracts", () => {
  it("can express a user to tool to final message sequence", () => {
    const call: ToolCall = { id: "call-1", name: "echo", input: { value: "hi" } };
    const messages: CoreMessage[] = [
      { role: "user", content: "Say hi through a tool" },
      { role: "assistant", toolCalls: [call] },
      { role: "tool", toolCallId: call.id, name: call.name, content: "hi", isError: false },
      { role: "assistant", content: "hi" }
    ];

    expect(messages.at(1)).toMatchObject({ role: "assistant", toolCalls: [call] });
    expect(messages.at(2)).toMatchObject({ role: "tool", toolCallId: "call-1" });
  });

  it("can express a structured tool failure observation", () => {
    const result: ToolResult = {
      ok: false,
      error: { code: "TEST_TOOL_FAILED", message: "The test tool failed" }
    };
    const observation: CoreMessage = {
      role: "tool",
      toolCallId: "call-2",
      name: "fail",
      content: "TEST_TOOL_FAILED: The test tool failed",
      isError: true
    };

    expect(result.ok).toBe(false);
    expect(observation.isError).toBe(true);
  });

  it("keeps provider responses independent from provider SDK types", () => {
    const response: ProviderResponse = {
      type: "tool_calls",
      toolCalls: [{ id: "call-3", name: "echo", input: { value: "hi" } }],
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    };

    expect(response.type).toBe("tool_calls");
    expect(response.usage?.totalTokens).toBe(3);
  });

  it("can express model metadata, usage, and unknown cost without provider SDK types", () => {
    const metadata: ModelMetadata = {
      providerId: "ai-sdk",
      modelId: "openai/gpt-4.1-mini",
      purposes: ["primary", "summarizer"],
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      capabilities: {
        toolCalling: true,
        streaming: true,
        reasoning: false,
        usage: "optional"
      }
    };
    const usage: Usage = {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      cost: { status: "unknown", reason: "pricing metadata unavailable" }
    };

    expect(metadata.capabilities?.toolCalling).toBe(true);
    expect(usage.cost?.status).toBe("unknown");
  });

  it("can express normalized provider errors with routing metadata", () => {
    const error: ProviderError = {
      category: ProviderErrorCategory.RateLimit,
      code: "RATE_LIMITED",
      message: "The provider rejected the request because of rate limits",
      retryable: true,
      providerId: "ai-sdk",
      modelId: "openai/gpt-4.1-mini",
      requestId: "req-123",
      statusCode: 429,
      metadata: { retryAfterMs: 1_000 }
    };

    expect(error.category).toBe("rate-limit");
    expect(error.retryable).toBe(true);
  });

  it("can express production operations resources without leaking credential values", () => {
    const health: ProviderHealth = {
      providerId: "ai-sdk",
      modelId: "gpt-test",
      status: "healthy",
      checkedAt: "2026-05-27T00:00:00.000Z",
      latencyMs: 12,
      diagnostics: []
    };
    const credential: CredentialConfigView = {
      providerId: "ai-sdk",
      source: "env",
      status: "configured",
      redacted: { OPENAI_API_KEY: "sk-...abcd" },
      diagnostics: []
    };
    const trust: TrustDescriptor = {
      level: "first-party",
      scopes: [{ kind: "tool", access: "execute", value: "filesystem.read" }]
    };
    const audit: AuditSummary = {
      runId: "run-ops",
      toolCalls: { started: 1, completed: 1, failed: 0 },
      permissions: { requested: 1, allowed: 1, denied: 0 },
      usage: { totalTokens: 3, cost: { status: "unknown" } },
      failures: []
    };
    const metrics: MetricsSnapshot = {
      updatedAt: "2026-05-27T00:00:00.000Z",
      counters: { "runs.completed": 1 }
    };

    expect(health.status).toBe("healthy");
    expect(JSON.stringify(credential)).not.toContain("secret");
    expect(trust.scopes?.[0]?.kind).toBe("tool");
    expect(audit.usage.cost?.status).toBe("unknown");
    expect(metrics.counters["runs.completed"]).toBe(1);
  });

  it("keeps legacy provider failure errors representable during migration", () => {
    const response: ProviderResponse = {
      type: "failure",
      error: {
        code: "LEGACY_PROVIDER_FAILED",
        message: "Legacy provider failed",
        details: { retryable: false }
      }
    };

    expect(response.error).toMatchObject({ code: "LEGACY_PROVIDER_FAILED" });
  });

  it("can express built-in and extension capability descriptor metadata", () => {
    const builtIn: CapabilityDescriptor = {
      type: "tool",
      name: "fs_read",
      source: "built-in",
      layer: "built-in-core",
      status: "registered",
      namespace: "filesystem",
      owner: { kind: "core", id: "guga-core" },
      declaredEffects: ["filesystem.read"],
      permissionRequirements: [{ subject: "workspace", actions: ["read"] }]
    };
    const extension: ExtensionSpecMetadata = {
      id: "mcp",
      name: "MCP",
      version: "0.0.0",
      source: { kind: "first-party", packageName: "@guga-agent/plugin-mcp" },
      namespace: "fixture",
      owner: { kind: "extension", id: "mcp", packageName: "@guga-agent/plugin-mcp" },
      declaredEffects: ["network.access"],
      dependencies: [{ kind: "service", name: "fixture", optional: true }],
      lifecycle: { load: "eager", unload: "remove-contributions", reload: "supported" }
    };
    const mcpTool: CapabilityDescriptor = {
      type: "tool",
      name: "mcp__fixture__echo",
      source: "mcp",
      layer: "extension",
      status: "registered",
      namespace: "fixture",
      ownerPluginId: "mcp",
      owner: extension.owner,
      extension,
      declaredEffects: ["network.access"],
      override: {
        status: "denied",
        target: { type: "tool", name: "fs_read", layer: "built-in-core" },
        reason: "extensions cannot replace built-ins without host policy",
        owner: extension.owner
      }
    };

    expect(JSON.parse(JSON.stringify([builtIn, mcpTool]))).toEqual([builtIn, mcpTool]);
    expect(mcpTool.override?.target.layer).toBe("built-in-core");
  });

  it("can express model events for text, tool intent, usage, finish, and provider errors", () => {
    const call: ToolCall = { id: "call-model-1", name: "search", input: { q: "guga" } };
    const events: ModelEvent[] = [
      {
        type: ModelEventType.TextDelta,
        runId: "run-model",
        turn: 0,
        providerId: "ai-sdk",
        modelId: "openai/gpt-4.1-mini",
        delta: "hello"
      },
      {
        type: ModelEventType.ToolIntent,
        runId: "run-model",
        turn: 0,
        providerId: "ai-sdk",
        modelId: "openai/gpt-4.1-mini",
        toolCall: call
      },
      {
        type: ModelEventType.Usage,
        runId: "run-model",
        turn: 0,
        usage: { inputTokens: 1, outputTokens: 2, cost: { status: "unknown" } }
      },
      {
        type: ModelEventType.Finished,
        runId: "run-model",
        turn: 0,
        finishReason: "tool-calls"
      },
      {
        type: ModelEventType.ProviderError,
        runId: "run-model",
        turn: 0,
        error: {
          category: ProviderErrorCategory.Auth,
          code: "AUTH_FAILED",
          message: "Invalid credentials"
        }
      }
    ];

    expect(events.map((event) => event.type)).toContain(ModelEventType.ToolIntent);
  });

  it("can express model hook request patches and response annotations without executing hooks", () => {
    const patch: ModelRequestPatch = {
      messages: [{ role: "user", content: "patched" }],
      metadata: { source: "fixture" }
    };
    const annotation: ModelResponseAnnotation = {
      annotations: { policy: "observed" }
    };

    expect(patch.messages?.[0]).toMatchObject({ role: "user", content: "patched" });
    expect(annotation.annotations.policy).toBe("observed");
  });

  it("can express context projections, policies, and pressure events", () => {
    const policy: ContextPolicy = {
      id: "default-context",
      phases: ["context.assemble"],
      auditIdentity: { label: "Default context policy" }
    };
    const projection: ModelInputProjection = {
      id: "projection-contract",
      runId: "run-context",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      sourceDescriptors: [{
        id: "message-0",
        kind: ContextSourceKind.PendingTurn,
        priority: ContextSourcePriority.High,
        provenance: { origin: "core" },
        tokenEstimate: { status: "estimated", tokens: 2 },
        modelVisible: true
      }],
      budget: {
        reservedOutputTokens: 1024,
        estimatedInputTokens: 2,
        estimateStatus: "partial",
        warningThreshold: 0.7,
        compactThreshold: 0.85
      },
      pressure: {
        id: "pressure-contract",
        level: "none",
        reason: "model context window is unknown",
        budget: {
          reservedOutputTokens: 1024,
          estimatedInputTokens: 2,
          estimateStatus: "partial",
          warningThreshold: 0.7,
          compactThreshold: 0.85
        },
        sourceIds: ["message-0"]
      },
      policyDecisions: []
    };
    const event: AgentEvent = {
      type: AgentEventType.ContextProjectionCreated,
      runId: "run-context",
      turn: 0,
      projection
    };

    expect(policy.phases).toEqual(["context.assemble"]);
    expect(event.projection.sourceDescriptors[0]?.kind).toBe(ContextSourceKind.PendingTurn);
  });

  it("can express a local plugin that registers provider, tool, and hook capabilities", () => {
    const plugin: LocalPlugin = {
      id: "example",
      init(context) {
        context.registerProvider({
          id: "example-provider",
          generate() {
            return { type: "final", content: "ok" };
          }
        });
        context.registerModel?.({
          providerId: "example-provider",
          modelId: "example-model",
          capabilities: { usage: "optional" }
        });
        context.registerTool({
          name: "example-tool",
          description: "Example tool",
          inputSchema: { type: "object" },
          effect: "read",
          execute() {
            return { ok: true, content: "ok" };
          }
        });
        context.registerHook({
          id: "example-gate",
          phase: HookPhase.PreToolGate,
          effect: HookEffect.Gate,
          handler() {
            return { type: "allow" };
          }
        });
      }
    };

    expect(plugin.id).toBe("example");
  });

  it("can express expanded tool runtime metadata without implementation modules", () => {
    const scope: ToolResourceScope = {
      kind: "path",
      access: "read",
      value: "README.md"
    };
    const tool: ToolDefinition = {
      name: "read_file",
      description: "Read a file from the current workspace",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      },
      effect: "read",
      runtime: {
        permission: { defaultAction: "allow", scope: "resource" },
        executionMode: "automatic",
        scheduler: {
          concurrency: "read-only",
          resources: { mode: "static", scopes: [scope] }
        },
        resultBudget: { maxContentChars: 4_000, strategy: "truncate" },
        renderer: { category: "read", label: "Read file" },
        source: { kind: "first-party", packageName: "@guga-agent/core/builtins" },
        visibility: "model",
        availability: { status: "available" },
        backend: { kind: "local-workspace" }
      },
      execute() {
        return { ok: true, content: "ok" };
      }
    };

    expect(tool.runtime?.scheduler?.concurrency).toBe("read-only");
    expect(tool.runtime?.renderer?.category).toBe("read");
  });

  it("can express Action OS tool metadata while preserving legacy effects", () => {
    const principal: ToolPrincipalSummary = {
      kind: "service",
      id: "github-app-installation",
      label: "GitHub App installation",
      scopes: ["repo:read"]
    };
    const credential: ToolCredentialBinding = {
      credentialRef: "credential://github/app-installation",
      providerId: "github",
      principal,
      scopes: ["repo:read"],
      required: true,
      modelVisible: false
    };
    const sandbox: ToolSandboxRequirement = {
      isolation: "workspace",
      workspace: {
        required: true,
        writeAccess: "scoped",
        allowedPaths: ["packages/core"]
      },
      network: "restricted",
      backendKinds: ["local-workspace"],
      timeoutMs: 30_000,
      output: { maxBytes: 64_000, allowArtifacts: true }
    };
    const action: ToolActionMetadata = {
      category: "external",
      risk: "high",
      label: "Read issue from GitHub",
      effects: [{
        kind: "network",
        access: "read",
        target: "api.github.com",
        external: true
      }],
      tags: ["mcp", "github"]
    };
    const evalHints: ToolMetadataEvalHints = {
      categories: ["tool-selection"],
      coveredRisks: ["high"],
      expectedUseCases: ["Read a GitHub issue when the user asks for repository context"],
      unsafeUseCases: ["Do not call when no repository or issue is mentioned"],
      selectionTags: ["github", "read-only"],
      auditRequirements: ["credential reference present", "network sandbox declared"]
    };
    const tool: ToolDefinition = {
      name: "github_issue_read",
      description: "Read a GitHub issue through a configured integration",
      inputSchema: { type: "object", properties: { issue: { type: "number" } }, required: ["issue"] },
      effect: "external",
      runtime: {
        action,
        principal,
        credentials: [credential],
        sandbox,
        environment: {
          credentials: [credential],
          sandbox,
          backendKinds: ["local-workspace"]
        },
        source: {
          kind: "mcp",
          namespace: "github",
          upstreamId: "issues.read",
          trust: { level: "third-party", reason: "remote MCP server" }
        },
        eval: evalHints
      },
      execute() {
        return { ok: true, content: "ok" };
      }
    };
    const serialized = JSON.stringify(tool.runtime);

    expect(tool.effect).toBe("external");
    expect(tool.runtime?.action?.effects?.[0]?.kind).toBe("network");
    expect(serialized).toContain("credential://github/app-installation");
    expect(serialized).not.toContain("ghp_");
    expect(JSON.parse(serialized)).toMatchObject({
      action: { category: "external", risk: "high" },
      sandbox: { isolation: "workspace", network: "restricted" }
    });
  });

  it("does not allow raw credential values in credential binding contracts", () => {
    const credential: PublicToolCredentialBinding = {
      credentialRef: "credential://env/OPENAI_API_KEY",
      providerId: "openai",
      required: true,
      modelVisible: false
    };
    const publicAction: PublicToolActionMetadata = {
      category: "external",
      risk: "medium"
    };
    const publicSandbox: PublicToolSandboxRequirement = {
      isolation: "process",
      network: "restricted"
    };
    const publicEval: PublicToolMetadataEvalHints = {
      categories: ["tool-selection"],
      coveredRisks: ["medium"]
    };

    expect(JSON.stringify({ credential, publicAction, publicSandbox, publicEval })).not.toContain("sk-");

    const unsafe = {
      credentialRef: "credential://env/OPENAI_API_KEY",
      // @ts-expect-error raw credential material is not part of the public credential binding shape
      secretValue: "sk-secret"
    } satisfies PublicToolCredentialBinding;

    expect("secretValue" in unsafe).toBe(true);
  });

  it("can express shell permission, backend, and visibility contracts", () => {
    const tool: ToolDefinition = {
      name: "shell_exec",
      description: "Execute a shell command in the workspace",
      inputSchema: { type: "object", properties: { command: { type: "string" } } },
      effect: "execute",
      runtime: {
        permission: {
          defaultAction: "ask",
          profileActions: { headless: "deny", "trusted-session": "allow" },
          scope: "command",
          prompt: { title: "Run shell command", summary: "Execute command in workspace" }
        },
        executionMode: "interactive",
        scheduler: { concurrency: "serial", resources: { mode: "none" } },
        backend: { kind: "local-shell" },
        renderer: { category: "execute" },
        availability: { status: "missing-backend", reason: "shell backend not configured" }
      },
      execute() {
        return { ok: true, content: "unused" };
      }
    };
    const projection: ToolProjection = {
      toolName: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      effect: tool.effect,
      visibility: {
        visible: false,
        toolName: tool.name,
        reason: "missing-backend"
      }
    };

    expect(tool.runtime?.permission?.defaultAction).toBe("ask");
    expect(projection.visibility.visible).toBe(false);
  });

  it("can express permission profiles, requests, and remembered decisions", () => {
    const policy: PermissionPolicy = { profile: "headless", timeoutMs: 50 };
    const intent: ToolIntent = {
      id: "intent-call-perm",
      toolName: "shell_exec",
      toolCallId: "call-perm",
      action: {
        category: "execute",
        risk: "high",
        effects: [{ kind: "process", access: "execute", target: "workspace shell" }]
      },
      inputSummary: "pnpm test"
    };
    const request: PermissionRequest = {
      runId: "run-perm",
      turn: 1,
      toolCallId: "call-perm",
      attempt: 1,
      call: { id: "call-perm", name: "shell_exec", input: { command: "pnpm test" } },
      profile: "headless",
      subject: {
        toolName: "shell_exec",
        effect: "execute",
        action: intent.action,
        commandSummary: "pnpm test"
      },
      intent
    };
    const decision = {
      action: "deny" as const,
      remember: "session" as const,
      source: "profile" as const,
      reason: "headless profile denies ask-required tools"
    };

    expect(policy.profile).toBe("headless");
    expect(request.subject.commandSummary).toBe("pnpm test");
    expect(request.intent?.action?.category).toBe("execute");
    expect(decision.remember).toBe("session");
  });

  it("can express tool hook phases with patch, block, and annotation decisions", () => {
    const decisions: ToolHookDecision[] = [
      { type: "patch", input: { path: "README.md" } },
      { type: "block", reason: "outside workspace" },
      { type: "annotate", annotations: { budget: "checked" } }
    ];

    expect(HookPhase.ToolCallBefore).toBe("tool.call.before");
    expect(HookPhase.ToolExecuteBefore).toBe("tool.execute.before");
    expect(HookPhase.ToolExecuteAfter).toBe("tool.execute.after");
    expect(HookPhase.ToolResultBefore).toBe("tool.result.before");
    expect(decisions.map((decision) => decision.type)).toEqual(["patch", "block", "annotate"]);
  });

  it("can express lifecycle, permission, budget, and visibility events with correlation fields", () => {
    const call: ToolCall = { id: "call-event", name: "read_file", input: { path: "README.md" } };
    const correlation = {
      runId: "run-event",
      turn: 2,
      toolCallId: call.id,
      attempt: 1,
      batchId: "batch-1"
    };
    const lease: ToolCapabilityLease = {
      leaseId: "lease-run-event-2",
      runId: correlation.runId,
      turn: correlation.turn,
      visibleToolNames: ["read_file"],
      decisions: [{ visible: true, toolName: "read_file", reason: "available" }]
    };
    const intent: ToolIntent = {
      id: "intent-call-event",
      toolName: call.name,
      toolCallId: call.id,
      action: { category: "read", risk: "low" },
      leaseId: lease.leaseId,
      correlation
    };
    const environment: ToolEnvironmentAssessment = {
      status: "satisfied",
      backendKinds: ["local-workspace"]
    };
    const events: AgentEvent[] = [
      {
        type: AgentEventType.ModelRequested,
        runId: correlation.runId,
        turn: correlation.turn,
        providerId: "mock",
        messages: [],
        toolNames: ["read_file"],
        toolLease: lease
      },
      {
        type: AgentEventType.ToolQueued,
        runId: correlation.runId,
        turn: correlation.turn,
        correlation,
        call,
        intent,
        environment
      },
      {
        type: AgentEventType.PermissionRequested,
        runId: correlation.runId,
        turn: correlation.turn,
        request: {
          ...correlation,
          call,
          profile: "default",
          subject: { toolName: call.name, effect: "read" },
          intent
        }
      },
      {
        type: AgentEventType.ToolResultBudgeted,
        runId: correlation.runId,
        turn: correlation.turn,
        correlation,
        call,
        intent,
        environment,
        result: {
          ok: true,
          content: "truncated",
          budget: {
            applied: true,
            originalContentChars: 10_000,
            notice: "Tool output was truncated"
          }
        }
      },
      {
        type: AgentEventType.ToolVisibilityFiltered,
        runId: correlation.runId,
        turn: correlation.turn,
        decision: { visible: false, toolName: "shell_exec", reason: "policy-denied" },
        lease
      }
    ];

    expect(events.map((event) => event.type)).toEqual([
      AgentEventType.ModelRequested,
      AgentEventType.ToolQueued,
      AgentEventType.PermissionRequested,
      AgentEventType.ToolResultBudgeted,
      AgentEventType.ToolVisibilityFiltered
    ]);
    expect(events[0]).toMatchObject({ toolLease: { leaseId: lease.leaseId } });
  });

  it("can express pre-tool gate allow and deny decisions", () => {
    const allow: PreToolGateDecision = { type: "allow" };
    const deny: PreToolGateDecision = {
      type: "deny",
      reason: "blocked by policy",
      metadata: { policy: "test" }
    };

    expect(allow.type).toBe("allow");
    expect(deny.reason).toBe("blocked by policy");
  });

  it("can express plugin lifecycle, hook decision, and structured failure events", () => {
    const call: ToolCall = { id: "call-4", name: "blocked", input: {} };

    expect([
      {
        type: AgentEventType.PluginCapabilityRegistered,
        runId: "run-contract",
        pluginId: "example",
        capability: "provider",
        name: "example-provider"
      },
      {
        type: AgentEventType.HookDecision,
        runId: "run-contract",
        phase: "pre_tool.gate",
        pluginId: "example",
        hookId: "example-gate",
        call,
        decision: { type: "deny", reason: "blocked" }
      },
      {
        type: AgentEventType.ModelEvent,
        runId: "run-contract",
        turn: 0,
        event: {
          type: ModelEventType.Finished,
          runId: "run-contract",
          turn: 0,
          finishReason: "stop"
        }
      },
      {
        type: AgentEventType.PluginFailure,
        runId: "run-contract",
        pluginId: "example",
        failure: "init",
        code: "PLUGIN_INIT_FAILED",
        message: "Init failed"
      }
    ]).toHaveLength(4);
  });

  it("can express durable store contracts without concrete storage", async () => {
    const event: AgentEvent = {
      type: AgentEventType.RunStarted,
      runId: "run-durable",
      input: "persist me"
    };
    const envelope: DurableEventEnvelope<AgentEvent> = {
      schemaVersion: 1,
      eventId: "event-1",
      eventType: event.type,
      streamId: "session/session-durable",
      streamRevision: 0,
      sessionId: "session-durable",
      branchId: "main",
      runId: event.runId,
      turn: 0,
      parentEventId: null,
      previousEventHash: null,
      createdAt: "2026-05-27T00:00:00.000Z",
      actor: { type: "user", id: "user-1" },
      source: { type: "runtime", id: "core" },
      payload: event,
      payloadHash: { algorithm: "sha256", value: "payload-hash" }
    };

    const eventStore: EventStore = {
      append() {
        return Promise.resolve({ ok: true, status: "appended", event: envelope, streamRevision: 0 });
      },
      readStream() {
        return Promise.resolve({ ok: true, events: [envelope], nextRevision: 1 });
      }
    };
    const sessionStore: SessionStore = {
      createSession() {
        return Promise.resolve({
          ok: true,
          session: {
            id: "session-durable",
            createdAt: envelope.createdAt,
            updatedAt: envelope.createdAt,
            activeBranchId: "main",
            rootBranchId: "main"
          },
          branch: {
            id: "main",
            sessionId: "session-durable",
            createdAt: envelope.createdAt,
            createdFrom: { type: "root" },
            visibleEventIds: [envelope.eventId]
          }
        });
      },
      getSessionTree() {
        return Promise.resolve({
          ok: true,
          session: {
            id: "session-durable",
            createdAt: envelope.createdAt,
            updatedAt: envelope.createdAt,
            activeBranchId: "main",
            rootBranchId: "main"
          },
          branches: [{
            id: "main",
            sessionId: "session-durable",
            createdAt: envelope.createdAt,
            createdFrom: { type: "root" },
            visibleEventIds: [envelope.eventId]
          }],
          activeLeaf: {
            sessionId: "session-durable",
            branchId: "main",
            eventId: envelope.eventId,
            updatedAt: envelope.createdAt,
            reason: "session-created"
          }
        });
      },
      forkBranch() {
        return Promise.resolve({
          ok: true,
          branch: {
            id: "branch-2",
            sessionId: "session-durable",
            createdAt: envelope.createdAt,
            createdFrom: {
              type: "event",
              branchId: "main",
              eventId: envelope.eventId
            },
            visibleEventIds: [envelope.eventId]
          }
        });
      },
      setActiveLeaf() {
        return Promise.resolve({
          ok: true,
          leaf: {
            sessionId: "session-durable",
            branchId: "main",
            eventId: envelope.eventId,
            updatedAt: envelope.createdAt,
            reason: "host-selected"
          }
        });
      }
    };
    const artifactStore: ArtifactStore = {
      putArtifact() {
        return Promise.resolve({
          ok: true,
          reference: {
            artifactId: "artifact-1",
            contentHash: { algorithm: "sha256", value: "artifact-hash" },
            sizeBytes: 12,
            mimeType: "text/plain",
            createdAt: envelope.createdAt,
            privacyTags: ["tool-output"],
            retention: "session",
            redaction: { state: "none" }
          }
        });
      },
      readArtifact() {
        return Promise.resolve({ ok: true, data: "hello world" });
      },
      tombstoneArtifact() {
        return Promise.resolve({
          ok: true,
          reference: {
            artifactId: "artifact-1",
            contentHash: { algorithm: "sha256", value: "artifact-hash" },
            sizeBytes: 12,
            mimeType: "text/plain",
            createdAt: envelope.createdAt,
            tombstone: { reason: "redacted", createdAt: envelope.createdAt }
          }
        });
      }
    };
    const replay: ReplayCapability = {
      replayConversation() {
        return Promise.resolve({ ok: true, messages: [{ role: "user", content: "persist me" }], diagnostics: [] });
      },
      replayModelInput() {
        return Promise.resolve({ ok: true, projection: undefined, diagnostics: [] });
      },
      replayAudit() {
        return Promise.resolve({ ok: true, timeline: [{ eventId: envelope.eventId, eventType: envelope.eventType }], diagnostics: [] });
      }
    };

    await expect(eventStore.append(envelope, { expectedRevision: "no-stream" })).resolves.toMatchObject({
      ok: true,
      status: "appended",
      streamRevision: 0
    });
    await expect(sessionStore.getSessionTree("session-durable")).resolves.toMatchObject({
      ok: true,
      activeLeaf: { branchId: "main", eventId: "event-1" }
    });
    await expect(artifactStore.putArtifact({ data: "hello world", mimeType: "text/plain" })).resolves.toMatchObject({
      ok: true,
      reference: { artifactId: "artifact-1", sizeBytes: 12, mimeType: "text/plain" }
    });
    await expect(replay.replayAudit({ sessionId: "session-durable", branchId: "main" })).resolves.toMatchObject({
      ok: true,
      timeline: [{ eventId: "event-1" }]
    });
  });

  it("can express artifact references, session branches, replay diagnostics, and runtime session identity", () => {
    const artifact: ArtifactReference = {
      artifactId: "artifact-contract",
      contentHash: { algorithm: "sha256", value: "hash-contract" },
      sizeBytes: 42,
      mimeType: "application/json",
      createdAt: "2026-05-27T00:00:00.000Z",
      privacyTags: ["audit"],
      retention: "until-deleted",
      redaction: { state: "redacted", reason: "host policy" }
    };
    const branch: SessionBranch = {
      id: "branch-contract",
      sessionId: "session-contract",
      parentBranchId: "main",
      createdAt: "2026-05-27T00:00:00.000Z",
      createdFrom: {
        type: "event",
        branchId: "main",
        eventId: "event-contract",
        visibility: "visible"
      },
      visibleEventIds: ["event-contract"]
    };
    const runOptions: AgentRunOptions = {
      input: "continue",
      session: { sessionId: "session-contract", branchId: branch.id, parentEventId: "event-contract" }
    };
    const runtimeOptions: AgentRuntimeOptions = {
      session: { sessionId: "session-contract", branchId: "main" }
    };

    expect(artifact.redaction?.state).toBe("redacted");
    expect(branch.createdFrom).toMatchObject({ type: "event", eventId: "event-contract" });
    expect(runOptions.session?.parentEventId).toBe("event-contract");
    expect(runtimeOptions.session?.sessionId).toBe("session-contract");
  });

  it("keeps durable persistence contracts exported from the public core API", () => {
    const eventStore: PublicEventStore | undefined = undefined;
    const envelope: PublicDurableEventEnvelope | undefined = undefined;
    const resumeReport: PublicResumeReport | undefined = undefined;

    expect(eventStore).toBeUndefined();
    expect(envelope).toBeUndefined();
    expect(resumeReport).toBeUndefined();
  });
});
