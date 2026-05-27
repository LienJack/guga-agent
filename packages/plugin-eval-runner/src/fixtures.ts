import { AgentEventType, ProviderErrorCategory, type ProviderResponse } from "@guga-agent/core";
import type { EvalFixture } from "./eval-runner";

const passingResponse: ProviderResponse = {
  type: "final",
  content: "Guga eval fixture passed.",
  usage: {
    inputTokens: 3,
    outputTokens: 4,
    totalTokens: 7
  }
};

const failingResponse: ProviderResponse = {
  type: "failure",
  error: {
    category: ProviderErrorCategory.Fatal,
    code: "FIXTURE_PROVIDER_FAILED",
    message: "Fixture intentionally failed"
  }
};

export const passingMockFixture: EvalFixture = {
  id: "mock-final-answer",
  name: "Mock final answer",
  input: "return the fixture answer",
  runId: "eval-pass",
  mockResponses: [passingResponse],
  expected: {
    ok: true,
    finalAnswer: "Guga eval fixture passed.",
    eventTypes: [AgentEventType.RunFinished]
  }
};

export const failingMockFixture: EvalFixture = {
  id: "mock-provider-failure",
  name: "Mock provider failure",
  input: "trigger failure",
  runId: "eval-fail",
  mockResponses: [failingResponse],
  expected: {
    ok: true
  }
};
