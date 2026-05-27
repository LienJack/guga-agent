import {
  createAgentRuntime,
  createMockProvider,
  type AgentEvent,
  type AgentRuntimeOptions,
  type OperationalDiagnostic,
  type ProviderResponse
} from "@guga-agent/core";

export type EvalExpectation = {
  ok?: boolean;
  finalAnswer?: string;
  finalAnswerIncludes?: string;
  errorCode?: string;
  eventTypes?: AgentEvent["type"][];
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
  const runtime = createAgentRuntime(options.runtime ?? {});
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

  return diagnostics;
}
