import {
  AgentEventType,
  createAgentRuntime,
  createMockProvider,
  type AgentEvent,
  type AgentRuntimeOptions,
  type OperationalDiagnostic,
  type ProviderResponse,
  type ToolIntent
} from "@guga-agent/core";

export type EvalToolCallExpectation = string | {
  toolName: string;
  eventType?: AgentEvent["type"];
  minCount?: number;
  maxCount?: number;
  resultOk?: boolean;
  actionCategory?: string;
  risk?: string;
};

export type EvalEventMetadataExpectation = {
  eventType: AgentEvent["type"];
  toolName?: string;
  path: string;
  exists?: boolean;
  equals?: unknown;
  includes?: string;
};

export type EvalExpectation = {
  ok?: boolean;
  finalAnswer?: string;
  finalAnswerIncludes?: string;
  errorCode?: string;
  eventTypes?: AgentEvent["type"][];
  toolCalls?: EvalToolCallExpectation[];
  forbiddenToolCalls?: string[];
  eventMetadata?: EvalEventMetadataExpectation[];
};

export type EvalFixture = {
  id: string;
  name?: string;
  input: string;
  providerId?: string;
  modelId?: string;
  runId?: string;
  maxTurns?: number;
  mockResponses: ProviderResponse[];
  runtime?: AgentRuntimeOptions;
  expected?: EvalExpectation;
};

export type EvalRunnerOptions = {
  runtime?: AgentRuntimeOptions;
};

export type EvalResult = {
  fixtureId: string;
  name?: string;
  ok: boolean;
  runId?: string;
  finalAnswer?: string;
  diagnostics: OperationalDiagnostic[];
};

export type EvalSuiteResult = {
  ok: boolean;
  passed: number;
  failed: number;
  results: EvalResult[];
};

export async function runEvalFixture(
  fixture: EvalFixture,
  options: EvalRunnerOptions = {}
): Promise<EvalResult> {
  const providerId = fixture.providerId ?? "mock";
  const runtime = createAgentRuntime(fixture.runtime ?? options.runtime ?? {});
  runtime.registerProvider(createMockProvider(fixture.mockResponses, { id: providerId }));

  const result = await runtime.run({
    input: fixture.input,
    providerId,
    ...(fixture.modelId === undefined ? {} : { modelId: fixture.modelId }),
    ...(fixture.runId === undefined ? {} : { runId: fixture.runId }),
    ...(fixture.maxTurns === undefined ? {} : { maxTurns: fixture.maxTurns })
  });
  const diagnostics = evaluateResult(fixture, result);
  const shutdown = await runtime.dispose();
  for (const failure of shutdown.failures) {
    diagnostics.push({
      severity: "error",
      code: failure.code,
      message: failure.message
    });
  }

  const evalResult: EvalResult = {
    fixtureId: fixture.id,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    runId: result.runId,
    diagnostics
  };
  if (fixture.name !== undefined) {
    evalResult.name = fixture.name;
  }
  if (result.ok) {
    evalResult.finalAnswer = result.finalAnswer;
  }
  return evalResult;
}

export async function runEvalSuite(
  fixtures: EvalFixture[],
  options: EvalRunnerOptions = {}
): Promise<EvalSuiteResult> {
  const results: EvalResult[] = [];
  for (const fixture of fixtures) {
    results.push(await runEvalFixture(fixture, options));
  }
  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  return {
    ok: failed === 0,
    passed,
    failed,
    results
  };
}

function evaluateResult(
  fixture: EvalFixture,
  result: Awaited<ReturnType<ReturnType<typeof createAgentRuntime>["run"]>>
): OperationalDiagnostic[] {
  const expected = fixture.expected ?? { ok: true };
  const diagnostics: OperationalDiagnostic[] = [];
  const expectedOk = expected.ok ?? true;
  if (result.ok !== expectedOk) {
    diagnostics.push({
      severity: "error",
      code: "EVAL_STATUS_MISMATCH",
      message: `Fixture ${fixture.id} expected ok=${expectedOk} but got ok=${result.ok}`
    });
  }

  if (result.ok) {
    if (expected.finalAnswer !== undefined && result.finalAnswer !== expected.finalAnswer) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_FINAL_ANSWER_MISMATCH",
        message: `Fixture ${fixture.id} final answer did not match exactly`
      });
    }
    if (expected.finalAnswerIncludes !== undefined && !result.finalAnswer.includes(expected.finalAnswerIncludes)) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_FINAL_ANSWER_MISSING_TEXT",
        message: `Fixture ${fixture.id} final answer did not include expected text`
      });
    }
  } else {
    if (expected.errorCode !== undefined && result.error.code !== expected.errorCode) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_ERROR_CODE_MISMATCH",
        message: `Fixture ${fixture.id} expected error ${expected.errorCode} but got ${result.error.code}`
      });
    }
    if (expectedOk) {
      diagnostics.push({
        severity: "error",
        code: result.error.code,
        message: result.error.message
      });
    }
  }

  for (const eventType of expected.eventTypes ?? []) {
    if (!result.events.some((event) => event.type === eventType)) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_EVENT_MISSING",
        message: `Fixture ${fixture.id} did not emit expected event ${eventType}`
      });
    }
  }

  diagnostics.push(...evaluateToolCallExpectations(fixture, result.events, expected));
  diagnostics.push(...evaluateEventMetadataExpectations(fixture, result.events, expected));

  return diagnostics;
}

function evaluateToolCallExpectations(
  fixture: EvalFixture,
  events: readonly AgentEvent[],
  expected: EvalExpectation
): OperationalDiagnostic[] {
  const diagnostics: OperationalDiagnostic[] = [];
  const toolEvents = events.filter(isToolEvent);

  for (const forbiddenToolName of expected.forbiddenToolCalls ?? []) {
    if (toolEvents.some((event) => event.call.name === forbiddenToolName)) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_FORBIDDEN_TOOL_CALL",
        message: `Fixture ${fixture.id} emitted forbidden tool call ${forbiddenToolName}`
      });
    }
  }

  for (const rawExpectation of expected.toolCalls ?? []) {
    const expectation = normalizeToolCallExpectation(rawExpectation);
    const eventType = expectation.eventType ?? AgentEventType.ToolStarted;
    const matching = toolEvents.filter((event) => event.type === eventType && event.call.name === expectation.toolName);
    const minCount = expectation.minCount ?? 1;
    if (matching.length < minCount) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_TOOL_CALL_MISSING",
        message: `Fixture ${fixture.id} expected at least ${minCount} ${eventType} event(s) for ${expectation.toolName} but saw ${matching.length}`
      });
      continue;
    }
    if (expectation.maxCount !== undefined && matching.length > expectation.maxCount) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_TOOL_CALL_COUNT_MISMATCH",
        message: `Fixture ${fixture.id} expected at most ${expectation.maxCount} ${eventType} event(s) for ${expectation.toolName} but saw ${matching.length}`
      });
    }
    const expectedResultOk = expectation.resultOk;
    if (expectedResultOk !== undefined && !matching.some((event) => eventHasResultOk(event, expectedResultOk))) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_TOOL_RESULT_MISMATCH",
        message: `Fixture ${fixture.id} expected ${expectation.toolName} result ok=${expectedResultOk}`
      });
    }
    if (expectation.actionCategory !== undefined && !matching.some((event) => eventIntent(event)?.action?.category === expectation.actionCategory)) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_TOOL_INTENT_MISMATCH",
        message: `Fixture ${fixture.id} expected ${expectation.toolName} action category ${expectation.actionCategory}`
      });
    }
    if (expectation.risk !== undefined && !matching.some((event) => eventIntent(event)?.action?.risk === expectation.risk)) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_TOOL_INTENT_MISMATCH",
        message: `Fixture ${fixture.id} expected ${expectation.toolName} risk ${expectation.risk}`
      });
    }
  }

  return diagnostics;
}

function evaluateEventMetadataExpectations(
  fixture: EvalFixture,
  events: readonly AgentEvent[],
  expected: EvalExpectation
): OperationalDiagnostic[] {
  const diagnostics: OperationalDiagnostic[] = [];
  for (const expectation of expected.eventMetadata ?? []) {
    const matching = events.filter((event) =>
      event.type === expectation.eventType
      && (expectation.toolName === undefined || (isToolEvent(event) && event.call.name === expectation.toolName))
    );
    const values = matching.map((event) => valueAtPath(event, expectation.path));
    if (expectation.exists === false) {
      if (values.some((value) => value !== undefined)) {
        diagnostics.push({
          severity: "error",
          code: "EVAL_EVENT_METADATA_UNEXPECTED",
          message: `Fixture ${fixture.id} expected ${expectation.eventType}.${expectation.path} to be absent`
        });
      }
      continue;
    }
    const requiresExists = expectation.exists ?? (expectation.equals === undefined && expectation.includes === undefined);
    if (requiresExists && !values.some((value) => value !== undefined)) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_EVENT_METADATA_MISSING",
        message: `Fixture ${fixture.id} expected ${expectation.eventType}.${expectation.path} to exist`
      });
      continue;
    }
    if (expectation.equals !== undefined && !values.some((value) => JSON.stringify(value) === JSON.stringify(expectation.equals))) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_EVENT_METADATA_MISMATCH",
        message: `Fixture ${fixture.id} expected ${expectation.eventType}.${expectation.path} to equal ${JSON.stringify(expectation.equals)}`
      });
    }
    if (expectation.includes !== undefined && !values.some((value) => typeof value === "string" && value.includes(expectation.includes!))) {
      diagnostics.push({
        severity: "error",
        code: "EVAL_EVENT_METADATA_MISMATCH",
        message: `Fixture ${fixture.id} expected ${expectation.eventType}.${expectation.path} to include ${expectation.includes}`
      });
    }
  }
  return diagnostics;
}

function normalizeToolCallExpectation(expectation: EvalToolCallExpectation): Exclude<EvalToolCallExpectation, string> {
  return typeof expectation === "string" ? { toolName: expectation } : expectation;
}

type AgentToolEvent = Extract<AgentEvent, { call: unknown }>;

function isToolEvent(event: AgentEvent): event is AgentToolEvent {
  return "call" in event && typeof event.call === "object" && event.call !== null && "name" in event.call;
}

function eventHasResultOk(event: AgentToolEvent, ok: boolean): boolean {
  if (!("result" in event) || typeof event.result !== "object" || event.result === null || !("ok" in event.result)) {
    return false;
  }
  return event.result.ok === ok;
}

function eventIntent(event: AgentToolEvent): ToolIntent | undefined {
  return "intent" in event ? event.intent : undefined;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, value);
}
