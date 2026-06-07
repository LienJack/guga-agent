import { CoreError } from "../contracts/errors";
import { AgentEventType } from "../contracts/events";
import type { ToolHookDecision } from "../contracts/hooks";
import { HookPhase } from "../contracts/hooks";
import type { ToolCall } from "../contracts/messages";
import type { PermissionRequest } from "../contracts/permissions";
import type {
  ToolAvailability,
  ToolAvailabilityContext,
  ToolActionMetadata,
  ToolActionRisk,
  ToolCallCorrelation,
  ToolCapabilityLease,
  ToolIntent,
  ToolResourceScope,
  ToolRuntimeResult
} from "../contracts/tool-runtime";
import type { ToolDefinition, ToolExecutionContext, ToolResult } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { PermissionKernel } from "../permissions/permission-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ResultPolicy } from "./result-policy";
import { toolEnvironmentRequirementFor, toolVisibilityDecision } from "./tool-projection";

export type ExecutionPipelineOptions = {
  registry: CapabilityRegistry;
  eventBus?: EventBus;
  hookKernel?: HookKernel;
  permissionKernel?: PermissionKernel;
  resultPolicy?: ResultPolicy;
  availabilityContext?: ToolAvailabilityContext;
};

export type ExecuteToolCallOptions = {
  runId: string;
  turn: number;
  call: ToolCall;
  attempt?: number;
  batchId?: string;
  source?: ToolCallCorrelation["source"];
  taskId?: string;
  toolLease?: ToolCapabilityLease;
  signal?: AbortSignal;
  availabilityContext?: ToolAvailabilityContext;
};

export class ExecutionPipeline {
  private readonly registry: CapabilityRegistry;
  private readonly eventBus: EventBus;
  private readonly hookKernel: HookKernel | undefined;
  private readonly permissionKernel: PermissionKernel;
  private readonly resultPolicy: ResultPolicy;
  private readonly availabilityContext: ToolAvailabilityContext;

  constructor(options: ExecutionPipelineOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus ?? new EventBus();
    this.hookKernel = options.hookKernel;
    this.permissionKernel = options.permissionKernel ?? new PermissionKernel({ eventBus: this.eventBus });
    this.resultPolicy = options.resultPolicy ?? new ResultPolicy({ eventBus: this.eventBus });
    this.availabilityContext = options.availabilityContext ?? {};
  }

  async execute(options: ExecuteToolCallOptions): Promise<ToolRuntimeResult> {
    const correlation = correlationFor(options);
    const tool = this.registry.getTool(options.call.name);
    const queuedIntent = tool
      ? toolIntentFor(options.call, tool, correlation, intentContextFor(options))
      : missingToolIntentFor(options.call, correlation, options.toolLease);
    this.eventBus.publish({
      type: AgentEventType.ToolQueued,
      runId: options.runId,
      turn: options.turn,
      correlation,
      call: options.call,
      intent: queuedIntent
    });

    if (options.signal?.aborted) {
      return this.finish(
        options.call,
        correlation,
        this.resultPolicy.synthetic("cancelled", "Tool call was cancelled before execution"),
        "cancelled",
        undefined,
        queuedIntent
      );
    }

    if (this.hookKernel) {
      const gateResult = await this.hookKernel.runPreToolGate({
        runId: options.runId,
        turn: options.turn,
        call: options.call,
        tools: this.registry.listTools()
      });
      if (!gateResult.ok) {
        throw new CoreError("HOOK_FAILED", gateResult.error.message, {
          hook: gateResult.failedHook,
          error: gateResult.error
        });
      }
      if ("deniedBy" in gateResult) {
        return this.finish(
          options.call,
          correlation,
          blocked(gateResult.decision.reason, {
            hookId: gateResult.deniedBy.id,
            pluginId: gateResult.deniedBy.pluginId
          }),
          "hook_blocked",
          tool,
          queuedIntent
        );
      }
    }

    if (!tool) {
      const result = failure("TOOL_NOT_FOUND", `Tool not registered: ${options.call.name}`, { toolCall: options.call });
      return this.finish(options.call, correlation, result, "missing_tool", undefined, queuedIntent);
    }

    const unavailable = toolUnavailableResult(tool, options.availabilityContext ?? this.availabilityContext);
    if (unavailable) {
      return this.finish(options.call, correlation, unavailable, "unavailable", tool, queuedIntent);
    }

    const callHook = await this.runToolHook(HookPhase.ToolCallBefore, {
      options,
      call: options.call,
      tool,
      input: options.call.input,
      correlation
    });
    const preValidationIntent = toolIntentFor(callHook.call, tool, correlation, intentContextFor(options));
    if (callHook.block) {
      return this.finish(callHook.call, correlation, blocked(callHook.block.reason, callHook.block.metadata), "hook_blocked", tool, preValidationIntent);
    }

    const patchedCall = callHook.call;
    const validationFailure = validateInput(tool, patchedCall.input);
    if (validationFailure) {
      return this.finish(patchedCall, correlation, validationFailure, "schema_invalid", tool, preValidationIntent);
    }
    const scopes = scopesFor(tool, patchedCall);
    const intent = toolIntentFor(patchedCall, tool, correlation, intentContextFor(options, scopes));

    const permission = await this.permissionKernel.resolve({
      request: permissionRequestFor(options, patchedCall, tool, correlation, scopes, intent),
      tool,
      ...(options.signal ? { signal: options.signal } : {})
    });
    if (!permission.ok) {
      return this.finish(
        patchedCall,
        correlation,
        permission.result,
        permission.result.error.code === "TOOL_PERMISSION_TIMEOUT"
          ? "permission_timeout"
          : permission.result.error.code === "TOOL_PERMISSION_CANCELLED"
            ? "cancelled"
            : "permission_denied",
        tool,
        intent
      );
    }

    const executeBeforeHook = await this.runToolHook(HookPhase.ToolExecuteBefore, {
      options,
      call: patchedCall,
      tool,
      input: patchedCall.input,
      correlation
    });
    if (executeBeforeHook.block) {
      const blockedIntent = toolIntentFor(executeBeforeHook.call, tool, correlation, intentContextFor(options, scopes));
      return this.finish(executeBeforeHook.call, correlation, blocked(executeBeforeHook.block.reason, executeBeforeHook.block.metadata), "hook_blocked", tool, blockedIntent);
    }
    if (executeBeforeHook.inputPatched) {
      return this.finish(
        patchedCall,
        correlation,
        blocked("tool.execute.before hooks cannot patch input after permission resolution"),
        "hook_blocked",
        tool,
        intent
      );
    }

    const executableCall = patchedCall;
    const start = await this.eventBus.publishDurable({
      type: AgentEventType.ToolStarted,
      runId: options.runId,
      turn: options.turn,
      correlation,
      call: executableCall,
      intent
    }, {
      idempotencyKey: durableToolKey(correlation, "tool.started")
    });
    if (!start.ok) {
      return this.finish(
        executableCall,
        correlation,
        failure("TOOL_PERSISTENCE_UNAVAILABLE", "Tool execution start marker could not be durably recorded", start),
        "exception",
        tool,
        intent
      );
    }

    const rawResult = await executeTool(executableCall, tool, options.signal);
    const executionReason = !rawResult.ok && rawResult.error.code === "TOOL_TIMEOUT" ? "timeout" : undefined;
    const afterHook = await this.runToolHook(HookPhase.ToolExecuteAfter, {
      options,
      call: executableCall,
      tool,
      input: executableCall.input,
      correlation,
      result: rawResult
    });
    if (afterHook.block) {
      const blockedIntent = toolIntentFor(afterHook.call, tool, correlation, intentContextFor(options, scopes));
      return this.finish(afterHook.call, correlation, blocked(afterHook.block.reason, afterHook.block.metadata), "hook_blocked", tool, blockedIntent);
    }
    const resultHook = await this.runToolHook(HookPhase.ToolResultBefore, {
      options,
      call: afterHook.call,
      tool,
      input: afterHook.call.input,
      correlation,
      result: applyAnnotations(rawResult, [...afterHook.annotations])
    });
    if (resultHook.block) {
      const blockedIntent = toolIntentFor(resultHook.call, tool, correlation, intentContextFor(options, scopes));
      return this.finish(resultHook.call, correlation, blocked(resultHook.block.reason, resultHook.block.metadata), "hook_blocked", tool, blockedIntent);
    }

    const annotatedResult = applyAnnotations(rawResult, [...afterHook.annotations, ...resultHook.annotations]);
    return this.finish(resultHook.call, correlation, annotatedResult, executionReason, tool, intent);
  }

  private async runToolHook(
    phase: typeof HookPhase.ToolCallBefore | typeof HookPhase.ToolExecuteBefore | typeof HookPhase.ToolExecuteAfter | typeof HookPhase.ToolResultBefore,
    options: {
      options: ExecuteToolCallOptions;
      call: ToolCall;
      tool: ToolDefinition;
      input: unknown;
      correlation: ToolCallCorrelation;
      result?: ToolResult;
    }
  ): Promise<{
    call: ToolCall;
    annotations: Record<string, unknown>[];
    inputPatched: boolean;
    block?: Extract<ToolHookDecision, { type: "block" }>;
  }> {
    if (!this.hookKernel) {
      return { call: options.call, annotations: [], inputPatched: false };
    }

    const control = options.options.signal
      ? { signal: options.options.signal, safety: "dangerous" as const }
      : { safety: "dangerous" as const };
    const result = await this.hookKernel.runToolHook(phase, {
      runId: options.options.runId,
      turn: options.options.turn,
      correlation: options.correlation,
      call: options.call,
      tool: options.tool,
      input: options.input,
      ...(options.result ? { result: options.result } : {}),
      control
    });

    if (!result.ok) {
      return {
        call: options.call,
        annotations: [],
        inputPatched: false,
        block: blockDecision(result.error.message, result.error.details)
      };
    }

    const patchedInput = result.inputPatched ? result.input : options.call.input;
    const call = result.inputPatched ? { ...options.call, input: patchedInput } : options.call;
    return {
      call,
      annotations: result.annotations,
      inputPatched: result.inputPatched,
      ...(result.block ? { block: result.block } : {})
    };
  }

  private async finish(
    call: ToolCall,
    correlation: ToolCallCorrelation,
    result: ToolResult,
    reason?: ToolRuntimeResult["reason"],
    tool?: ToolDefinition,
    intent?: ToolIntent
  ): Promise<ToolRuntimeResult> {
    const budgeted = this.resultPolicy.apply({
      call,
      correlation,
      result,
      ...(tool ? { tool } : {}),
      ...(tool?.runtime?.resultBudget ? { budget: tool.runtime.resultBudget } : {})
    });
    this.eventBus.publish({
      type: AgentEventType.ToolResult,
      runId: correlation.runId,
      turn: correlation.turn,
      call,
      correlation,
      result: budgeted,
      ...(intent ? { intent } : {})
    });
    const terminalEvent = {
      type: budgeted.ok ? AgentEventType.ToolCompleted : lifecycleFailureType(reason),
      runId: correlation.runId,
      turn: correlation.turn,
      correlation,
      call,
      result: budgeted,
      ...(intent ? { intent } : {})
    } as const;
    const terminal = await this.eventBus.publishDurable(terminalEvent, {
      idempotencyKey: durableToolKey(correlation, "tool.terminal")
    });
    if (!terminal.ok) {
      const uncertain = {
        ...budgeted,
        metadata: {
          ...budgeted.metadata,
          persistenceStatus: "interrupted",
          durableResult: terminal
        }
      };
      return { call, correlation, result: uncertain, ...(intent ? { intent } : {}), reason: reason ?? "exception" };
    }
    return { call, correlation, result: budgeted, ...(intent ? { intent } : {}), ...(reason ? { reason } : {}) };
  }
}

function blockDecision(reason: string, details: unknown): Extract<ToolHookDecision, { type: "block" }> {
  return details && typeof details === "object"
    ? { type: "block", reason, metadata: details as Record<string, unknown> }
    : { type: "block", reason };
}

function correlationFor(options: ExecuteToolCallOptions): ToolCallCorrelation {
  return {
    runId: options.runId,
    turn: options.turn,
    toolCallId: options.call.id,
    attempt: options.attempt ?? 1,
    ...(options.batchId ? { batchId: options.batchId } : {}),
    ...(options.source ? { source: options.source } : {}),
    ...(options.taskId ? { taskId: options.taskId } : {})
  };
}

function toolIntentFor(
  call: ToolCall,
  tool: ToolDefinition,
  correlation: ToolCallCorrelation,
  context: { lease?: ToolCapabilityLease; scopes?: readonly ToolResourceScope[] } = {}
): ToolIntent {
  const action: ToolActionMetadata = tool.runtime?.action ?? {
    category: actionCategoryForEffect(tool.effect),
    risk: riskForEffect(tool.effect),
    label: tool.description
  };
  const environment = toolEnvironmentRequirementFor(tool);
  const scopes = context.scopes ?? [];

  return {
    id: `intent-${correlation.runId}-${correlation.turn}-${call.id}-${correlation.attempt}`,
    toolName: tool.name,
    toolCallId: call.id,
    action,
    summary: action.summary ?? action.label ?? `${tool.effect} tool ${tool.name}`,
    inputSummary: inputSummaryFor(call.input, scopes),
    ...(scopes.length > 0 ? { resourceScopes: scopes } : {}),
    ...(tool.runtime?.principal ? { principal: tool.runtime.principal } : {}),
    ...(tool.runtime?.credentials ? { credentials: tool.runtime.credentials } : {}),
    ...(environment ? { environment } : {}),
    ...(context.lease ? { leaseId: context.lease.leaseId } : {}),
    correlation
  };
}

function missingToolIntentFor(
  call: ToolCall,
  correlation: ToolCallCorrelation,
  lease?: ToolCapabilityLease
): ToolIntent {
  return {
    id: `intent-${correlation.runId}-${correlation.turn}-${call.id}-${correlation.attempt}`,
    toolName: call.name,
    toolCallId: call.id,
    action: {
      category: "custom",
      risk: "high",
      label: `Unregistered tool ${call.name}`
    },
    summary: `Model requested unregistered tool ${call.name}`,
    inputSummary: inputSummaryFor(call.input, []),
    ...(lease ? { leaseId: lease.leaseId } : {}),
    correlation
  };
}

function actionCategoryForEffect(effect: ToolDefinition["effect"]): NonNullable<ToolIntent["action"]>["category"] {
  switch (effect) {
    case "read":
      return "read";
    case "write":
      return "write";
    case "execute":
      return "execute";
    case "external":
      return "external";
  }
}

function riskForEffect(effect: ToolDefinition["effect"]): ToolActionRisk {
  switch (effect) {
    case "read":
      return "low";
    case "write":
      return "medium";
    case "execute":
    case "external":
      return "high";
  }
}

function inputSummaryFor(input: unknown, scopes: readonly ToolResourceScope[]): string {
  const command = commandSummaryFor(input);
  if (command) {
    return command;
  }
  if (scopes.length > 0) {
    return scopes.map(scopeSummary).join(", ");
  }
  if (!input || typeof input !== "object") {
    return String(input ?? "");
  }
  const keys = Object.keys(input as Record<string, unknown>).slice(0, 8);
  return keys.length > 0 ? `input keys: ${keys.join(", ")}` : "empty object input";
}

function intentContextFor(
  options: Pick<ExecuteToolCallOptions, "toolLease">,
  scopes?: readonly ToolResourceScope[]
): { lease?: ToolCapabilityLease; scopes?: readonly ToolResourceScope[] } {
  return {
    ...(options.toolLease ? { lease: options.toolLease } : {}),
    ...(scopes ? { scopes } : {})
  };
}

function permissionRequestFor(
  options: ExecuteToolCallOptions,
  call: ToolCall,
  tool: ToolDefinition,
  correlation: ToolCallCorrelation,
  scopes: ToolResourceScope[],
  intent: ToolIntent
): PermissionRequest {
  const environment = toolEnvironmentRequirementFor(tool);
  return {
    runId: options.runId,
    turn: options.turn,
    toolCallId: call.id,
    attempt: correlation.attempt,
    ...(correlation.batchId ? { batchId: correlation.batchId } : {}),
    call,
    profile: "default",
    subject: {
      toolName: tool.name,
      effect: tool.effect,
      ...(intent.action ? { action: intent.action } : {}),
      ...(tool.runtime?.principal ? { principal: tool.runtime.principal } : {}),
      ...(tool.runtime?.credentials ? { credentials: tool.runtime.credentials } : {}),
      ...(environment ? { environment } : {}),
      ...(scopes.length > 0 ? { scopes, resourceSummary: scopes.map(scopeSummary).join(", ") } : {}),
      ...(tool.runtime?.permission?.scope === "command" ? { commandSummary: commandSummaryFor(call.input) } : {})
    },
    intent,
    ...((correlation.source || correlation.taskId)
      ? {
          metadata: {
            ...(correlation.source ? { source: correlation.source } : {}),
            ...(correlation.taskId ? { taskId: correlation.taskId } : {})
          }
        }
      : {})
  };
}

function scopesFor(tool: ToolDefinition, call: ToolCall): ToolResourceScope[] {
  const resources = tool.runtime?.scheduler?.resources;
  if (!resources || resources.mode === "none") {
    return [];
  }
  if (resources.mode === "static") {
    return [...resources.scopes];
  }
  return [...resources.extract(call.input, call)];
}

function scopeSummary(scope: ToolResourceScope): string {
  return `${scope.kind}:${scope.access}:${scope.value}`;
}

function commandSummaryFor(input: unknown): string {
  if (!input || typeof input !== "object" || !("command" in input)) {
    return "";
  }
  const command = String((input as Record<string, unknown>).command).replace(/\s+/g, " ").trim();
  return command.length > 120 ? `${command.slice(0, 117)}...` : command;
}

function toolUnavailableResult(tool: ToolDefinition, context: ToolAvailabilityContext): ToolResult | undefined {
  const decision = toolVisibilityDecision(tool, context);
  if (!decision.visible) {
    const availability = decision.metadata?.availability as ToolAvailability | undefined;
    return failure("TOOL_UNAVAILABLE", availability?.status === "available" || !availability ? `Tool is not model-visible: ${tool.name}` : availability.reason, decision.metadata);
  }
  return undefined;
}

async function executeTool(call: ToolCall, tool: ToolDefinition, signal?: AbortSignal): Promise<ToolResult> {
  try {
    const timeoutController = new AbortController();
    const abortFromParent = () => timeoutController.abort(signal?.reason);
    if (signal?.aborted) {
      timeoutController.abort(signal.reason);
    } else {
      signal?.addEventListener("abort", abortFromParent, { once: true });
    }
    try {
      const context: ToolExecutionContext = { call, signal: timeoutController.signal };
      return await runToolWithTimeout(tool.execute(call.input, context), tool.runtime?.timeoutMs, timeoutController);
    } finally {
      signal?.removeEventListener("abort", abortFromParent);
    }
  } catch (error) {
    return failure("TOOL_EXECUTION_FAILED", error instanceof Error ? error.message : "Tool execution failed", error);
  }
}

async function runToolWithTimeout(result: Promise<ToolResult> | ToolResult, timeoutMs: number | undefined, controller: AbortController): Promise<ToolResult> {
  if (timeoutMs === undefined) {
    return result;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      result,
      new Promise<ToolResult>((resolve) => {
        timeout = setTimeout(() => {
          resolve(failure("TOOL_TIMEOUT", "Tool execution timed out", { timeoutMs }));
          controller.abort(new DOMException("Tool execution timed out", "TimeoutError"));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function validateInput(tool: ToolDefinition, input: unknown): ToolResult | undefined {
  const error = validateAgainstSchema(tool.inputSchema, input, "$");
  return error ? failure("TOOL_SCHEMA_INVALID", `Tool ${tool.name} invalid input: ${error.message}`, error) : undefined;
}

type JsonSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  enum?: unknown[];
  additionalProperties?: boolean;
};

function validateAgainstSchema(schema: unknown, input: unknown, path: string): { path: string; message: string } | undefined {
  if (!isJsonSchemaObject(schema)) {
    return undefined;
  }

  if (schema.enum && !schema.enum.some((value) => Object.is(value, input))) {
    return { path, message: `${path} must be one of ${schema.enum.map(String).join(", ")}` };
  }

  if (schema.type && !matchesJsonType(input, schema.type)) {
    return { path, message: `${path} must be ${schema.type}` };
  }

  if (schema.type === "object") {
    const record = input as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(record, key)) {
        return { path: `${path}.${key}`, message: `${path}.${key} is required` };
      }
    }

    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(record, key)) {
        const error = validateAgainstSchema(propertySchema, record[key], `${path}.${key}`);
        if (error) {
          return error;
        }
      }
    }

    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      const extra = Object.keys(record).find((key) => !known.has(key));
      if (extra) {
        return { path: `${path}.${extra}`, message: `${path}.${extra} is not allowed` };
      }
    }
  }

  return undefined;
}

function isJsonSchemaObject(schema: unknown): schema is JsonSchema {
  return !!schema && typeof schema === "object" && !Array.isArray(schema);
}

function matchesJsonType(input: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return !!input && typeof input === "object" && !Array.isArray(input);
    case "array":
      return Array.isArray(input);
    case "string":
      return typeof input === "string";
    case "number":
      return typeof input === "number";
    case "integer":
      return Number.isInteger(input);
    case "boolean":
      return typeof input === "boolean";
    case "null":
      return input === null;
    default:
      return true;
  }
}

function failure(code: string, message: string, details?: unknown): ToolResult {
  return {
    ok: false,
    error: { code, message, details }
  };
}

function blocked(reason: string, details?: unknown): ToolResult {
  return failure("TOOL_CALL_BLOCKED", reason, details);
}

function applyAnnotations(result: ToolResult, annotations: Record<string, unknown>[]): ToolResult {
  if (annotations.length === 0) {
    return result;
  }

  return {
    ...result,
    metadata: {
      ...result.metadata,
      annotations
    }
  };
}

function lifecycleFailureType(reason: ToolRuntimeResult["reason"] | undefined): typeof AgentEventType.ToolFailed | typeof AgentEventType.ToolDenied | typeof AgentEventType.ToolCancelled | typeof AgentEventType.ToolTimeout {
  if (reason === "permission_denied" || reason === "hook_blocked") {
    return AgentEventType.ToolDenied;
  }
  if (reason === "cancelled") {
    return AgentEventType.ToolCancelled;
  }
  if (reason === "timeout" || reason === "permission_timeout") {
    return AgentEventType.ToolTimeout;
  }
  return AgentEventType.ToolFailed;
}

function durableToolKey(correlation: ToolCallCorrelation, boundary: string): string {
  return [
    correlation.runId,
    correlation.turn,
    correlation.toolCallId,
    correlation.attempt,
    correlation.batchId ?? "batchless",
    boundary
  ].join(":");
}
