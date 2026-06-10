import type { LocalPlugin, ToolDefinition, ToolResult } from "@guga-agent/core";
import { runDelegationBatch, type NormalizedDelegationTask } from "./delegation-batch-runner";
import {
  createDelegationLedger,
  renderDelegationBatchResult,
  renderDelegationResult
} from "./delegation-ledger";
import {
  DEFAULT_DELEGATE_TASK_TOOL_NAME,
  LEGACY_DELEGATE_TASK_TOOL_NAME,
  type DelegateChildTaskInput,
  type DelegateTaskBatchOutput,
  type DelegateTaskOutput,
  type DelegateTaskToolOptions,
  type DelegationAgentType,
  type DelegationBlockedCapability,
  type DelegationChildOutcome,
  type DelegationRunRecord,
  type DelegationStatus,
  type DelegationToolCatalogItem,
  type DelegationValidationDiagnostic
} from "./delegation-types";

const defaultMaxTurns = 4;
const defaultTimeoutMs = 600_000;
const defaultMaxConcurrency = 3;
const defaultMaxBatchTasks = 3;
const defaultMaxInputChars = 60_000;
const defaultMaxChildMetadataChars = 8_000;

const defaultBlockedCapabilities: DelegationBlockedCapability[] = [
  "delegation",
  "user-clarification",
  "memory-mutation",
  "user-presentation"
];

const defaultBlockedToolNames = [
  DEFAULT_DELEGATE_TASK_TOOL_NAME,
  LEGACY_DELEGATE_TASK_TOOL_NAME,
  "ask_user",
  "ask_clarification",
  "ask_user_question",
  "clarify",
  "question",
  "request_user_input",
  "memory",
  "memory_write",
  "memory_delete",
  "memory.add",
  "save_memory",
  "present",
  "present_files",
  "respond_to_user",
  "send_message"
];

type ParsedDelegationInput = {
  mode: "single" | "batch";
  tasks: DelegateChildTaskInput[];
  maxConcurrency: number;
};

type ParseLimits = {
  maxBatchTasks: number;
  maxInputChars: number;
  defaultMaxConcurrency: number;
};

type ToolSelectionFailure = {
  ok: false;
  code: string;
  message: string;
  details: unknown;
};

export function createDelegateTaskTool(options: DelegateTaskToolOptions): ToolDefinition {
  const toolName = options.toolName ?? DEFAULT_DELEGATE_TASK_TOOL_NAME;

  return {
    name: toolName,
    description: options.description ?? "Delegate one or more self-contained tasks to isolated child agents and return compact results.",
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
      availability: { status: "available" },
      visibility: "model"
    },
    async execute(input, context): Promise<ToolResult> {
      const parentRunId = resolveParentRunId(options);
      const parentToolCallId = context.call.id;
      const maxBatchTasks = positiveIntegerOption(options.maxBatchTasks, defaultMaxBatchTasks);
      const maxInputChars = positiveIntegerOption(options.maxInputChars, defaultMaxInputChars);
      const maxChildMetadataChars = positiveIntegerOption(options.maxChildMetadataChars, defaultMaxChildMetadataChars);
      const configuredMaxConcurrency = positiveIntegerOption(options.defaultMaxConcurrency, defaultMaxConcurrency);

      const catalogResult = resolveToolCatalog(options);
      if (!catalogResult.ok) {
        return failure(catalogResult.code, catalogResult.message, catalogResult.details);
      }

      const configDiagnostics = validateDelegationConfig({
        ...options,
        toolCatalog: [...catalogResult.catalog]
      });
      if (configDiagnostics.length > 0) {
        return failure("DELEGATION_CONFIG_INVALID", "Delegate task configuration is invalid", configDiagnostics);
      }

      const parsed = parseDelegateTaskInput(input, {
        maxBatchTasks,
        maxInputChars,
        defaultMaxConcurrency: configuredMaxConcurrency
      });
      if (!parsed.ok) {
        return failure("DELEGATION_INPUT_INVALID", "Delegate task input is invalid", parsed.diagnostics);
      }

      const blockedToolNames = createBlockedToolNameSet(toolName, options.blockedToolNames);
      const blockedCapabilities = createBlockedCapabilitySet(options.blockedCapabilities);
      const normalized = normalizeDelegationTasks({
        parsed: parsed.input,
        options,
        catalog: catalogResult.catalog,
        blockedToolNames,
        blockedCapabilities,
        parentRunId,
        parentToolCallId
      });
      if (!normalized.ok) {
        return failure(normalized.code, normalized.message, normalized.details);
      }

      const outcomes = await runDelegationBatch({
        tasks: normalized.tasks,
        childRunner: options.childRunner,
        parentRunId,
        parentToolCallId,
        maxConcurrency: parsed.input.mode === "single" ? 1 : parsed.input.maxConcurrency,
        ...(context.signal ? { parentSignal: context.signal } : {}),
        maxChildMetadataChars
      });

      if (parsed.input.mode === "single") {
        const outcome = outcomes[0];
        if (!outcome) {
          return failure("DELEGATION_RUNNER_FAILED", "Delegation runner produced no result");
        }
        return singleDelegationResult(outcome, parentRunId, parentToolCallId);
      }

      return batchDelegationResult(outcomes, parentRunId, parentToolCallId);
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

export function buildDelegationInput(input: DelegateChildTaskInput, agentType: DelegationAgentType, tools: readonly string[]): string {
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
  const catalogByName = new Map<string, DelegationToolCatalogItem>();
  for (const [index, tool] of (options.toolCatalog ?? []).entries()) {
    if (!tool.name.trim()) {
      diagnostics.push({ code: "DELEGATION_CATALOG_TOOL_NAME_EMPTY", message: "Tool catalog item name is required", path: `toolCatalog[${index}].name` });
    }
    if (catalogNames.has(tool.name)) {
      diagnostics.push({ code: "DELEGATION_CATALOG_DUPLICATE_TOOL", message: `Tool catalog contains duplicate tool: ${tool.name}`, path: `toolCatalog[${index}].name` });
    }
    catalogNames.add(tool.name);
    catalogByName.set(tool.name, tool);
  }

  validatePositiveOption(options.defaultMaxTurns, "defaultMaxTurns", diagnostics);
  validatePositiveOption(options.defaultTimeoutMs, "defaultTimeoutMs", diagnostics);
  validatePositiveOption(options.defaultMaxConcurrency, "defaultMaxConcurrency", diagnostics);
  validatePositiveOption(options.maxBatchTasks, "maxBatchTasks", diagnostics);
  validatePositiveOption(options.maxInputChars, "maxInputChars", diagnostics);
  validatePositiveOption(options.maxChildMetadataChars, "maxChildMetadataChars", diagnostics);

  const blockedToolNames = createBlockedToolNameSet(toolName, options.blockedToolNames);
  const blockedCapabilities = createBlockedCapabilitySet(options.blockedCapabilities);
  const blockedDefaults = (options.defaultToolAllowlist ?? []).filter((tool) => {
    const catalogItem = catalogByName.get(tool);
    return isBlockedToolName(tool, blockedToolNames) || hasBlockedCapability(catalogItem, blockedCapabilities);
  });
  if (blockedDefaults.length > 0) {
    diagnostics.push({ code: "DELEGATION_DEFAULT_ALLOWLIST_RECURSIVE", message: `Default allowlist cannot include blocked child tool(s): ${blockedDefaults.join(", ")}`, path: "defaultToolAllowlist" });
  }
  return diagnostics;
}

function parseDelegateTaskInput(input: unknown, limits: ParseLimits):
  | { ok: true; input: ParsedDelegationInput }
  | { ok: false; diagnostics: DelegationValidationDiagnostic[] } {
  const diagnostics: DelegationValidationDiagnostic[] = [];
  const serializedLength = safeSerializedLength(input);
  if (serializedLength > limits.maxInputChars) {
    diagnostics.push({ code: "DELEGATION_INPUT_TOO_LARGE", message: `Delegate task input exceeds ${limits.maxInputChars} characters` });
  }
  if (!isRecord(input)) {
    diagnostics.push({ code: "DELEGATION_INPUT_NOT_OBJECT", message: "Delegate task input must be an object" });
    return { ok: false, diagnostics };
  }

  const hasTasks = Object.hasOwn(input, "tasks");
  const hasGoal = Object.hasOwn(input, "goal");
  if (hasTasks) {
    if (hasGoal) {
      diagnostics.push({ code: "DELEGATION_INPUT_MODE_AMBIGUOUS", message: "Use either root goal or tasks, not both", path: "goal" });
    }
    for (const field of ["context", "agentType", "toolAllowlist", "maxTurns", "timeoutMs"]) {
      if (Object.hasOwn(input, field)) {
        diagnostics.push({ code: "DELEGATION_BATCH_ROOT_FIELD_INVALID", message: `Batch input field ${field} belongs on each task`, path: field });
      }
    }
    if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
      diagnostics.push({ code: "DELEGATION_TASKS_REQUIRED", message: "Batch delegation requires a non-empty tasks array", path: "tasks" });
    } else if (input.tasks.length > limits.maxBatchTasks) {
      diagnostics.push({ code: "DELEGATION_TASKS_TOO_MANY", message: `Batch delegation supports at most ${limits.maxBatchTasks} tasks`, path: "tasks" });
    }

    const maxConcurrency = parsePositiveInteger(input.maxConcurrency, "maxConcurrency", diagnostics);
    const tasks = Array.isArray(input.tasks)
      ? input.tasks.map((task, index) => parseChildTask(task, `tasks[${index}]`, diagnostics)).filter((task): task is DelegateChildTaskInput => !!task)
      : [];

    if (diagnostics.length > 0) {
      return { ok: false, diagnostics };
    }
    return {
      ok: true,
      input: {
        mode: "batch",
        tasks,
        maxConcurrency: maxConcurrency ?? limits.defaultMaxConcurrency
      }
    };
  }

  if (Object.hasOwn(input, "maxConcurrency")) {
    diagnostics.push({ code: "DELEGATION_MAX_CONCURRENCY_WITHOUT_TASKS", message: "maxConcurrency is only valid with tasks", path: "maxConcurrency" });
  }
  const task = parseChildTask(input, "$", diagnostics);
  if (diagnostics.length > 0 || !task) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    input: {
      mode: "single",
      tasks: [task],
      maxConcurrency: 1
    }
  };
}

function parseChildTask(input: unknown, path: string, diagnostics: DelegationValidationDiagnostic[]): DelegateChildTaskInput | undefined {
  if (!isRecord(input)) {
    diagnostics.push({ code: "DELEGATION_TASK_NOT_OBJECT", message: "Delegation task must be an object", path });
    return undefined;
  }
  const allowedFields = new Set(["id", "goal", "context", "agentType", "toolAllowlist", "maxTurns", "timeoutMs"]);
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) {
      diagnostics.push({ code: "DELEGATION_TASK_FIELD_UNKNOWN", message: `Delegation task field is not allowed: ${key}`, path: `${path}.${key}` });
    }
  }

  const goal = input.goal;
  if (typeof goal !== "string" || !goal.trim()) {
    diagnostics.push({ code: "DELEGATION_GOAL_REQUIRED", message: "Delegate task goal is required", path: `${path}.goal` });
  }
  const id = input.id;
  if (id !== undefined && (typeof id !== "string" || !id.trim())) {
    diagnostics.push({ code: "DELEGATION_TASK_ID_INVALID", message: "Delegation task id must be a non-empty string", path: `${path}.id` });
  }
  if (input.context !== undefined && typeof input.context !== "string") {
    diagnostics.push({ code: "DELEGATION_CONTEXT_INVALID", message: "Delegate task context must be a string", path: `${path}.context` });
  }
  if (input.agentType !== undefined && (typeof input.agentType !== "string" || !input.agentType.trim())) {
    diagnostics.push({ code: "DELEGATION_AGENT_TYPE_INVALID", message: "Delegate task agentType must be a non-empty string", path: `${path}.agentType` });
  }
  if (input.toolAllowlist !== undefined && (!Array.isArray(input.toolAllowlist) || input.toolAllowlist.some((item) => typeof item !== "string" || !item.trim()))) {
    diagnostics.push({ code: "DELEGATION_TOOL_ALLOWLIST_INVALID", message: "Delegate task toolAllowlist must contain non-empty strings", path: `${path}.toolAllowlist` });
  }
  const maxTurns = parsePositiveInteger(input.maxTurns, `${path}.maxTurns`, diagnostics);
  const timeoutMs = parsePositiveInteger(input.timeoutMs, `${path}.timeoutMs`, diagnostics);
  if (typeof goal !== "string" || !goal.trim()) {
    return undefined;
  }

  return {
    ...(typeof id === "string" ? { id: id.trim() } : {}),
    goal: goal.trim(),
    ...(typeof input.context === "string" ? { context: input.context } : {}),
    ...(typeof input.agentType === "string" ? { agentType: input.agentType.trim() as DelegationAgentType } : {}),
    ...(Array.isArray(input.toolAllowlist) ? { toolAllowlist: input.toolAllowlist.map((tool) => tool.trim()) } : {}),
    ...(typeof maxTurns === "number" ? { maxTurns } : {}),
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {})
  };
}

function normalizeDelegationTasks(input: {
  parsed: ParsedDelegationInput;
  options: DelegateTaskToolOptions;
  catalog: readonly DelegationToolCatalogItem[];
  blockedToolNames: ReadonlySet<string>;
  blockedCapabilities: ReadonlySet<DelegationBlockedCapability>;
  parentRunId: string;
  parentToolCallId: string;
}): { ok: true; tasks: NormalizedDelegationTask[] } | ToolSelectionFailure {
  const tasks: NormalizedDelegationTask[] = [];
  for (const [taskIndex, task] of input.parsed.tasks.entries()) {
    const agentType = task.agentType ?? input.options.defaultAgentType ?? "general";
    const toolSelection = selectChildTools(task, input.options, input.catalog, input.blockedToolNames, input.blockedCapabilities);
    if (!toolSelection.ok) {
      return toolSelection;
    }

    const childIdInput = {
      parentRunId: input.parentRunId,
      parentToolCallId: input.parentToolCallId,
      taskIndex,
      ...(task.id ? { taskId: task.id } : {}),
      agentType
    };
    const childRunId = input.options.createChildRunId?.(childIdInput)
      ?? defaultChildRunId(input.parentToolCallId, taskIndex, input.parsed.mode);
    const childSessionId = input.options.createChildSessionId?.({
      parentRunId: input.parentRunId,
      childRunId,
      taskIndex,
      ...(task.id ? { taskId: task.id } : {}),
      agentType
    }) ?? `${sanitizeId(input.parentRunId)}/child/${childRunId}`;

    tasks.push({
      taskIndex,
      ...(task.id ? { taskId: task.id } : {}),
      goal: task.goal,
      ...(task.context ? { context: task.context } : {}),
      agentType,
      tools: toolSelection.tools,
      maxTurns: task.maxTurns ?? input.options.defaultMaxTurns ?? defaultMaxTurns,
      timeoutMs: task.timeoutMs ?? input.options.defaultTimeoutMs ?? defaultTimeoutMs,
      childRunId,
      childSessionId,
      input: buildDelegationInput(task, agentType, toolSelection.tools)
    });
  }
  return { ok: true, tasks };
}

function selectChildTools(
  input: DelegateChildTaskInput,
  options: DelegateTaskToolOptions,
  catalog: readonly DelegationToolCatalogItem[],
  blockedToolNames: ReadonlySet<string>,
  blockedCapabilities: ReadonlySet<DelegationBlockedCapability>
): { ok: true; tools: string[] } | ToolSelectionFailure {
  const catalogByName = new Map(catalog.map((tool) => [tool.name, tool]));
  const requested = input.toolAllowlist ?? options.defaultToolAllowlist ?? [];
  const unique = [...new Set(requested)];
  const blocked = unique.filter((tool) => isBlockedToolName(tool, blockedToolNames) || hasBlockedCapability(catalogByName.get(tool), blockedCapabilities));
  if (blocked.length > 0) {
    return {
      ok: false,
      code: "DELEGATION_RECURSION_BLOCKED",
      message: `Child tool allowlist includes blocked tool(s): ${blocked.join(", ")}`,
      details: { blocked }
    };
  }
  const unavailable = unique.filter((tool) => !catalogByName.has(tool));
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

function singleDelegationResult(outcome: DelegationChildOutcome, parentRunId: string, parentToolCallId: string): ToolResult {
  if (outcome.failureCode === "DELEGATION_OUTPUT_INVALID") {
    return failure("DELEGATION_OUTPUT_INVALID", "Delegate task output is invalid", outcome.diagnostics);
  }
  if (outcome.failureCode === "DELEGATION_RUNNER_FAILED") {
    return failure("DELEGATION_RUNNER_FAILED", outcome.summary);
  }

  const output: DelegateTaskOutput = {
    status: outcome.status,
    summary: outcome.summary,
    childRunId: outcome.childRunId,
    childSessionId: outcome.childSessionId,
    taskIndex: outcome.taskIndex,
    ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
    events: outcome.events ?? [],
    ...(outcome.metadata ? { metadata: outcome.metadata } : {})
  };
  const metadata = singleDelegationMetadata(outcome, parentRunId, parentToolCallId);

  if (outcome.status === "completed") {
    return {
      ok: true,
      content: renderDelegationResult(output),
      metadata
    };
  }
  return {
    ok: false,
    error: { code: `DELEGATION_${outcome.status.toUpperCase()}`, message: outcome.summary },
    metadata
  };
}

function batchDelegationResult(outcomes: readonly DelegationChildOutcome[], parentRunId: string, parentToolCallId: string): ToolResult {
  const records = outcomes.map((outcome) => runRecordForOutcome(outcome, parentRunId, parentToolCallId));
  const ledger = createDelegationLedger(records);
  const output: DelegateTaskBatchOutput = {
    status: aggregateBatchStatus(ledger.statusCounts, outcomes.length),
    summary: summarizeBatch(ledger.statusCounts, outcomes.length),
    childResults: [...outcomes].sort((left, right) => left.taskIndex - right.taskIndex),
    statusCounts: ledger.statusCounts,
    eventCounts: ledger.eventCounts
  };
  const childMetadata = collectChildMetadata(outcomes);

  return {
    ok: true,
    content: renderDelegationBatchResult(output),
    metadata: {
      ...(childMetadata ? { childMetadata } : {}),
      delegation: {
        parentRunId,
        parentToolCallId,
        mode: "batch",
        status: output.status,
        statusCounts: output.statusCounts,
        events: output.eventCounts,
        children: ledger.records.map((record) => ({
          taskIndex: record.taskIndex,
          ...(record.taskId ? { taskId: record.taskId } : {}),
          childRunId: record.childRunId,
          childSessionId: record.childSessionId,
          agentType: record.agentType,
          tools: record.tools,
          status: record.status
        }))
      }
    }
  };
}

function singleDelegationMetadata(outcome: DelegationChildOutcome, parentRunId: string, parentToolCallId: string): Record<string, unknown> {
  return {
    ...(outcome.metadata ? { childMetadata: outcome.metadata } : {}),
    delegation: {
      parentRunId,
      parentToolCallId,
      childRunId: outcome.childRunId,
      childSessionId: outcome.childSessionId,
      taskIndex: outcome.taskIndex,
      ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
      agentType: outcome.agentType,
      status: outcome.status,
      tools: outcome.tools,
      events: outcome.events ?? []
    }
  };
}

function runRecordForOutcome(outcome: DelegationChildOutcome, parentRunId: string, parentToolCallId: string): DelegationRunRecord {
  return {
    parentRunId,
    parentToolCallId,
    childRunId: outcome.childRunId,
    childSessionId: outcome.childSessionId,
    taskIndex: outcome.taskIndex,
    ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
    agentType: outcome.agentType,
    goal: outcome.goal,
    tools: outcome.tools,
    status: outcome.status,
    summary: outcome.summary,
    events: outcome.events ?? []
  };
}

function aggregateBatchStatus(statusCounts: Record<DelegationStatus, number>, total: number): DelegationStatus {
  if (total > 0 && statusCounts.completed === total) {
    return "completed";
  }
  if (total > 0 && statusCounts.cancelled === total) {
    return "cancelled";
  }
  if (total > 0 && statusCounts.timed_out === total) {
    return "timed_out";
  }
  return "failed";
}

function summarizeBatch(statusCounts: Record<DelegationStatus, number>, total: number): string {
  if (total > 0 && statusCounts.completed === total) {
    return `All ${total} delegated child task${total === 1 ? "" : "s"} completed.`;
  }
  const counts = (Object.entries(statusCounts) as Array<[DelegationStatus, number]>)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
  return `${statusCounts.completed}/${total} delegated child tasks completed; ${counts}.`;
}

function collectChildMetadata(outcomes: readonly DelegationChildOutcome[]): Record<string, unknown> | undefined {
  const entries = outcomes
    .filter((outcome) => outcome.metadata)
    .map((outcome) => [childMetadataKey(outcome), outcome.metadata]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function childMetadataKey(outcome: DelegationChildOutcome): string {
  return outcome.taskId ? `${outcome.taskIndex}:${outcome.taskId}` : String(outcome.taskIndex);
}

function resolveToolCatalog(options: DelegateTaskToolOptions):
  | { ok: true; catalog: readonly DelegationToolCatalogItem[] }
  | ToolSelectionFailure {
  try {
    return { ok: true, catalog: options.resolveToolCatalog?.() ?? options.toolCatalog ?? [] };
  } catch (error) {
    return {
      ok: false,
      code: "DELEGATION_CATALOG_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Delegation tool catalog is unavailable",
      details: error
    };
  }
}

function resolveParentRunId(options: DelegateTaskToolOptions): string {
  const resolved = typeof options.parentRunId === "function" ? options.parentRunId() : options.parentRunId;
  return resolved?.trim() || "unknown-parent-run";
}

function defaultChildRunId(parentToolCallId: string, taskIndex: number, mode: "single" | "batch"): string {
  const base = `${sanitizeId(parentToolCallId)}-child`;
  return mode === "single" ? base : `${base}-${taskIndex}`;
}

function sanitizeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "-") || "delegation";
}

function createBlockedToolNameSet(toolName: string, configured: readonly string[] | undefined): Set<string> {
  return new Set([toolName, ...defaultBlockedToolNames, ...(configured ?? [])]);
}

function createBlockedCapabilitySet(configured: readonly DelegationBlockedCapability[] | undefined): Set<DelegationBlockedCapability> {
  return new Set([...defaultBlockedCapabilities, ...(configured ?? [])]);
}

function isBlockedToolName(toolName: string, blockedToolNames: ReadonlySet<string>): boolean {
  return blockedToolNames.has(toolName.trim());
}

function hasBlockedCapability(tool: DelegationToolCatalogItem | undefined, blockedCapabilities: ReadonlySet<DelegationBlockedCapability>): boolean {
  return (tool?.capabilities ?? []).some((capability) => blockedCapabilities.has(capability));
}

function parsePositiveInteger(input: unknown, path: string, diagnostics: DelegationValidationDiagnostic[]): number | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1) {
    diagnostics.push({ code: "DELEGATION_POSITIVE_INTEGER_INVALID", message: "Value must be a positive integer", path });
    return undefined;
  }
  return input;
}

function validatePositiveOption(input: number | undefined, path: string, diagnostics: DelegationValidationDiagnostic[]): void {
  if (input !== undefined && (!Number.isInteger(input) || input < 1)) {
    diagnostics.push({ code: "DELEGATION_CONFIG_POSITIVE_INTEGER_INVALID", message: `${path} must be a positive integer`, path });
  }
}

function positiveIntegerOption(input: number | undefined, fallback: number): number {
  return input !== undefined && Number.isInteger(input) && input >= 1 ? input : fallback;
}

function safeSerializedLength(input: unknown): number {
  try {
    return JSON.stringify(input)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function delegationResourceValue(input: unknown): string {
  if (!isRecord(input)) {
    return "invalid";
  }
  if (Array.isArray(input.tasks)) {
    return JSON.stringify({
      mode: "batch",
      tasks: input.tasks.slice(0, defaultMaxBatchTasks).map((task) => isRecord(task) && typeof task.goal === "string" ? task.goal.trim().slice(0, 200) : "invalid"),
      maxConcurrency: typeof input.maxConcurrency === "number" ? input.maxConcurrency : undefined
    });
  }
  const goal = typeof input.goal === "string" ? input.goal.trim() : "";
  const agentType = typeof input.agentType === "string" ? input.agentType.trim() : "general";
  const tools = Array.isArray(input.toolAllowlist)
    ? input.toolAllowlist.filter((tool): tool is string => typeof tool === "string").map((tool) => tool.trim()).sort()
    : [];
  return JSON.stringify({
    mode: "single",
    agentType,
    goal: goal.slice(0, 200),
    tools
  });
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
  additionalProperties: false,
  properties: {
    goal: { type: "string" },
    context: { type: "string" },
    agentType: { type: "string" },
    toolAllowlist: { type: "array" },
    maxTurns: { type: "number" },
    timeoutMs: { type: "number" },
    tasks: { type: "array" },
    maxConcurrency: { type: "number" }
  }
} as const;
