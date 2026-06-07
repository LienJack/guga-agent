import type { LocalPlugin, ToolDefinition, ToolResult } from "@guga-agent/core";
import {
  DEFAULT_DELEGATE_TASK_TOOL_NAME,
  LEGACY_DELEGATE_TASK_TOOL_NAME,
  type DelegateTaskInput,
  type DelegateTaskOutput,
  type DelegateTaskToolOptions,
  type DelegationAgentType,
  type DelegationValidationDiagnostic
} from "./delegation-types";
import { renderDelegationResult, sortEventCounts, validateDelegationOutput } from "./delegation-ledger";

const defaultMaxTurns = 4;
const defaultTimeoutMs = 600_000;

export function createDelegateTaskTool(options: DelegateTaskToolOptions): ToolDefinition {
  const toolName = options.toolName ?? DEFAULT_DELEGATE_TASK_TOOL_NAME;
  const blockedToolNames = new Set([toolName, DEFAULT_DELEGATE_TASK_TOOL_NAME, LEGACY_DELEGATE_TASK_TOOL_NAME, ...(options.blockedToolNames ?? [])]);

  return {
    name: toolName,
    description: options.description ?? "Delegate one self-contained task to an isolated child agent and return a compact result.",
    effect: "external",
    inputSchema: delegateTaskInputSchema,
    runtime: {
      permission: {
        defaultAction: "ask",
        profileActions: { headless: "deny", background: "deny", "trusted-session": "allow" },
        scope: "resource",
        prompt: { title: "Delegate task" }
      },
      executionMode: "interactive",
      scheduler: {
        concurrency: "serial",
        resources: {
          mode: "extractor",
          extract: (input) => [{
            kind: "custom",
            access: "execute",
            value: delegationResourceValue(input)
          }]
        }
      },
      resultBudget: {
        maxContentChars: 12_000,
        strategy: "truncate"
      },
      action: {
        category: "delegate",
        risk: "high",
        label: "Delegate task",
        summary: "Run an isolated child agent with a scoped context and tool allowance.",
        effects: [{
          kind: "delegation",
          access: "execute",
          target: "child-agent",
          external: true,
          metadata: {
            defaultMaxTurns: options.defaultMaxTurns ?? defaultMaxTurns,
            defaultTimeoutMs: options.defaultTimeoutMs ?? defaultTimeoutMs,
            defaultAgentType: options.defaultAgentType ?? "general"
          }
        }],
        tags: ["delegation", "child-agent", "agent-runtime"]
      },
      principal: {
        kind: "agent",
        label: "Child agent"
      },
      renderer: {
        category: "custom",
        label: "Delegate task",
        icon: "network"
      },
      source: {
        kind: "first-party",
        packageName: "@guga-agent/plugin-tools-delegation",
        debugName: toolName
      },
      backend: {
        kind: "custom",
        description: "Delegation backend"
      },
      eval: {
        categories: ["tool-action", "delegation"],
        coveredRisks: ["high"],
        expectedUseCases: ["Use for self-contained subtasks that benefit from isolated agent execution."],
        unsafeUseCases: ["Do not delegate recursively or grant tools unavailable to the parent runtime."],
        selectionTags: ["delegate", "child-agent"],
        auditRequirements: ["Record parent/child run correlation, child tool allowance, budget, timeout, and compact event summary."]
      },
      availability: { status: "available" },
      visibility: "model"
    },
    async execute(input, context): Promise<ToolResult> {
      const parsed = parseDelegateTaskInput(input);
      if (!parsed.ok) {
        return failure("DELEGATION_INPUT_INVALID", "Delegate task input is invalid", parsed.diagnostics);
      }

      const parentRunId = resolveParentRunId(options);
      const parentToolCallId = context.call.id;
      const agentType = parsed.input.agentType ?? options.defaultAgentType ?? "general";
      const childRunId = options.createChildRunId?.({ parentRunId, parentToolCallId, agentType }) ?? `${sanitizeId(parentToolCallId)}-child`;
      const childSessionId = options.createChildSessionId?.({ parentRunId, childRunId, agentType }) ?? `${sanitizeId(parentRunId)}/child/${childRunId}`;
      const toolSelection = selectChildTools(parsed.input, options, blockedToolNames);
      if (!toolSelection.ok) {
        return failure(toolSelection.code, toolSelection.message, toolSelection.details);
      }
      const childBudget = {
        maxTurns: parsed.input.maxTurns ?? options.defaultMaxTurns ?? defaultMaxTurns,
        timeoutMs: parsed.input.timeoutMs ?? options.defaultTimeoutMs ?? defaultTimeoutMs
      };
      const baseMetadata = {
        parentRunId,
        parentToolCallId,
        childRunId,
        childSessionId,
        agentType,
        tools: toolSelection.tools,
        allowance: {
          tools: toolSelection.tools,
          context: parsed.input.context ? "provided" : "none"
        },
        budget: childBudget,
        timeoutMs: childBudget.timeoutMs,
        trace: {
          parentRunId,
          parentToolCallId,
          childRunId,
          childSessionId
        },
        evidence: {
          source: "delegation",
          rawSource: childSessionId,
          verifier: { status: "unverified" },
          redaction: { state: "none" },
          summary: "Child output is compacted before returning to the parent model."
        }
      };

      try {
        const childResult = await options.childRunner({
          input: buildDelegationInput(parsed.input, agentType, toolSelection.tools),
          goal: parsed.input.goal,
          ...(parsed.input.context ? { context: parsed.input.context } : {}),
          agentType,
          tools: toolSelection.tools,
          maxTurns: childBudget.maxTurns,
          timeoutMs: childBudget.timeoutMs,
          parentRunId,
          parentToolCallId,
          childRunId,
          childSessionId,
          ...(context.signal ? { signal: context.signal } : {})
        });
        const rawOutput: DelegateTaskOutput = {
          status: childResult.status,
          summary: childResult.summary,
          childRunId,
          childSessionId,
          events: childResult.events ?? [],
          ...(childResult.metadata ? { metadata: childResult.metadata } : {})
        };
        const diagnostics = validateDelegationOutput(rawOutput);
        if (diagnostics.length > 0) {
          return failure("DELEGATION_OUTPUT_INVALID", "Delegate task output is invalid", diagnostics);
        }
        const output = {
          ...rawOutput,
          events: sortEventCounts(rawOutput.events ?? [])
        };
        const metadata = {
          ...(output.metadata ? { childMetadata: output.metadata } : {}),
          delegation: {
            ...baseMetadata,
            status: output.status,
            events: output.events
          }
        };
        if (output.status === "completed") {
          return {
            ok: true,
            content: renderDelegationResult(output),
            metadata
          };
        }
        return {
          ok: false,
          error: { code: `DELEGATION_${output.status.toUpperCase()}`, message: output.summary },
          metadata
        };
      } catch (error) {
        if (context.signal?.aborted || isAbortError(error)) {
          return {
            ok: false,
            error: {
              code: "DELEGATION_CANCELLED",
              message: "Delegation was cancelled",
              details: error
            },
            metadata: {
              delegation: {
                ...baseMetadata,
                status: "cancelled",
                events: []
              }
            }
          };
        }
        return failure("DELEGATION_RUNNER_FAILED", error instanceof Error ? error.message : "Delegation runner failed", error);
      }
    }
  };
}

export type DelegationPluginOptions = DelegateTaskToolOptions & {
  pluginId?: string;
};

export function createDelegationPlugin(options: DelegationPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "agent-delegation";
  return {
    id: pluginId,
    name: "Agent Delegation",
    init(context) {
      context.registerTool(createDelegateTaskTool(options), {
        source: "plugin",
        ownerPluginId: pluginId,
        trust: {
          level: "first-party",
          scopes: [{ kind: "agent-delegation", access: "execute" }]
        }
      });
    }
  };
}

export function buildDelegationInput(input: DelegateTaskInput, agentType: DelegationAgentType, tools: readonly string[]): string {
  const sections = [
    `Agent type: ${agentType}`,
    `Goal:\n${input.goal.trim()}`,
    input.context?.trim() ? `Context:\n${input.context.trim()}` : undefined,
    tools.length > 0 ? `Allowed tools:\n${tools.map((tool) => `- ${tool}`).join("\n")}` : "Allowed tools: none"
  ];
  return sections.filter(Boolean).join("\n\n");
}

export function validateDelegationConfig(options: DelegateTaskToolOptions): DelegationValidationDiagnostic[] {
  const diagnostics: DelegationValidationDiagnostic[] = [];
  const toolName = options.toolName ?? DEFAULT_DELEGATE_TASK_TOOL_NAME;
  const catalogNames = new Set<string>();
  for (const [index, tool] of (options.toolCatalog ?? []).entries()) {
    if (!tool.name.trim()) {
      diagnostics.push({ code: "DELEGATION_CATALOG_TOOL_NAME_EMPTY", message: "Tool catalog item name is required", path: `toolCatalog[${index}].name` });
    }
    if (catalogNames.has(tool.name)) {
      diagnostics.push({ code: "DELEGATION_CATALOG_DUPLICATE_TOOL", message: `Tool catalog contains duplicate tool: ${tool.name}`, path: `toolCatalog[${index}].name` });
    }
    catalogNames.add(tool.name);
  }
  const blockedToolNames = new Set([toolName, DEFAULT_DELEGATE_TASK_TOOL_NAME, LEGACY_DELEGATE_TASK_TOOL_NAME, ...(options.blockedToolNames ?? [])]);
  const blockedDefaults = (options.defaultToolAllowlist ?? []).filter((tool) => blockedToolNames.has(tool));
  if (blockedDefaults.length > 0) {
    diagnostics.push({ code: "DELEGATION_DEFAULT_ALLOWLIST_RECURSIVE", message: `Default allowlist cannot include delegation tool(s): ${blockedDefaults.join(", ")}`, path: "defaultToolAllowlist" });
  }
  return diagnostics;
}

function parseDelegateTaskInput(input: unknown): { ok: true; input: DelegateTaskInput } | { ok: false; diagnostics: DelegationValidationDiagnostic[] } {
  const diagnostics: DelegationValidationDiagnostic[] = [];
  if (!isRecord(input)) {
    return { ok: false, diagnostics: [{ code: "DELEGATION_INPUT_NOT_OBJECT", message: "Delegate task input must be an object" }] };
  }
  const goal = input.goal;
  if (typeof goal !== "string" || !goal.trim()) {
    diagnostics.push({ code: "DELEGATION_GOAL_REQUIRED", message: "Delegate task goal is required", path: "goal" });
  }
  if (input.context !== undefined && typeof input.context !== "string") {
    diagnostics.push({ code: "DELEGATION_CONTEXT_INVALID", message: "Delegate task context must be a string", path: "context" });
  }
  if (input.agentType !== undefined && (typeof input.agentType !== "string" || !input.agentType.trim())) {
    diagnostics.push({ code: "DELEGATION_AGENT_TYPE_INVALID", message: "Delegate task agentType must be a non-empty string", path: "agentType" });
  }
  if (input.toolAllowlist !== undefined && (!Array.isArray(input.toolAllowlist) || input.toolAllowlist.some((item) => typeof item !== "string" || !item.trim()))) {
    diagnostics.push({ code: "DELEGATION_TOOL_ALLOWLIST_INVALID", message: "Delegate task toolAllowlist must contain non-empty strings", path: "toolAllowlist" });
  }
  const maxTurns = input.maxTurns;
  if (maxTurns !== undefined && (typeof maxTurns !== "number" || !Number.isInteger(maxTurns) || maxTurns < 1)) {
    diagnostics.push({ code: "DELEGATION_MAX_TURNS_INVALID", message: "Delegate task maxTurns must be a positive integer", path: "maxTurns" });
  }
  const timeoutMs = input.timeoutMs;
  if (timeoutMs !== undefined && (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1)) {
    diagnostics.push({ code: "DELEGATION_TIMEOUT_INVALID", message: "Delegate task timeoutMs must be a positive integer", path: "timeoutMs" });
  }
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    input: {
      goal: (goal as string).trim(),
      ...(typeof input.context === "string" ? { context: input.context } : {}),
      ...(typeof input.agentType === "string" ? { agentType: input.agentType } : {}),
      ...(Array.isArray(input.toolAllowlist) ? { toolAllowlist: input.toolAllowlist.map((tool) => tool.trim()) } : {}),
      ...(typeof input.maxTurns === "number" ? { maxTurns: input.maxTurns } : {}),
      ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {})
    }
  };
}

function selectChildTools(input: DelegateTaskInput, options: DelegateTaskToolOptions, blockedToolNames: ReadonlySet<string>):
  | { ok: true; tools: string[] }
  | { ok: false; code: string; message: string; details: unknown } {
  const catalog = new Set((options.toolCatalog ?? []).map((tool) => tool.name));
  const requested = input.toolAllowlist ?? options.defaultToolAllowlist ?? [];
  const unique = [...new Set(requested)];
  const blocked = unique.filter((tool) => blockedToolNames.has(tool));
  if (blocked.length > 0) {
    return {
      ok: false,
      code: "DELEGATION_RECURSION_BLOCKED",
      message: `Child tool allowlist includes blocked delegation tool(s): ${blocked.join(", ")}`,
      details: { blocked }
    };
  }
  const unavailable = unique.filter((tool) => !catalog.has(tool));
  if (unavailable.length > 0) {
    return {
      ok: false,
      code: "DELEGATION_TOOL_UNAVAILABLE",
      message: `Child tool allowlist includes unavailable tool(s): ${unavailable.join(", ")}`,
      details: { unavailable }
    };
  }
  return { ok: true, tools: unique.sort((left, right) => left.localeCompare(right)) };
}

function resolveParentRunId(options: DelegateTaskToolOptions): string {
  const resolved = typeof options.parentRunId === "function" ? options.parentRunId() : options.parentRunId;
  return resolved?.trim() || "unknown-parent-run";
}

function sanitizeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "-") || "delegation";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function delegationResourceValue(input: unknown): string {
  if (!isRecord(input)) {
    return "invalid";
  }
  const goal = typeof input.goal === "string" ? input.goal.trim() : "";
  const agentType = typeof input.agentType === "string" ? input.agentType.trim() : "general";
  const tools = Array.isArray(input.toolAllowlist)
    ? input.toolAllowlist.filter((tool): tool is string => typeof tool === "string").map((tool) => tool.trim()).sort()
    : [];
  return JSON.stringify({
    agentType,
    goal: goal.slice(0, 200),
    tools
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError" ||
    error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));
}

function failure(code: string, message: string, details?: unknown): ToolResult {
  return {
    ok: false,
    error: {
      code,
      message,
      details
    }
  };
}

const delegateTaskInputSchema = {
  type: "object",
  required: ["goal"],
  additionalProperties: false,
  properties: {
    goal: { type: "string" },
    context: { type: "string" },
    agentType: { type: "string" },
    toolAllowlist: {
      type: "array",
      items: { type: "string" }
    },
    maxTurns: { type: "number" },
    timeoutMs: { type: "number" }
  }
} as const;
