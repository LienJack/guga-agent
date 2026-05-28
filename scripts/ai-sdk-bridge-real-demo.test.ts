import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import { AgentEventType, createAgentRuntime } from "../packages/core/src";
import { createAiSdkProviderPlugin } from "../packages/core/src/builtins";

const env = loadDotEnv(".env");
const apiKey = env.API_KEY;
const baseURL = env.API_BASE_URL;
const modelId = env.DEEPSEEK_MODEL;

test.runIf(apiKey && baseURL && modelId)("runs the AI SDK bridge against the real OpenAI-compatible environment", async () => {
  const runtime = createAgentRuntime({
    model: createAiSdkProviderPlugin({
      id: "real-ai-sdk",
      mode: "openai-compatible",
      modelId,
      baseURL,
      apiKey,
      name: "real-openai-compatible",
      metadata: {
        displayName: modelId,
        purposes: ["primary"],
        capabilities: { toolCalling: true, usage: "optional" }
      }
    })
  });

  const observedEvents: unknown[] = [];
  runtime.onEvent((event) => observedEvents.push(event));

  const result = await runtime.run({
    input: "Reply with one short sentence that starts with: Guga real bridge",
    runId: "real-demo-run",
    maxTurns: 2
  });

  await runtime.dispose();

  const modelEvents = observedEvents
    .filter((event): event is { type: typeof AgentEventType.ModelEvent; event: { type: string } } =>
      isRecord(event) && event.type === AgentEventType.ModelEvent && isRecord(event.event) && typeof event.event.type === "string"
    )
    .map((event) => event.event.type);
  const usageEvents = observedEvents.filter((event) => isRecord(event) && event.type === AgentEventType.UsageRecorded);

  console.log("\nReal AI SDK bridge demo completed");
  console.log(JSON.stringify({
    ok: result.ok,
    baseURL: redactUrl(baseURL),
    modelId,
    finalAnswerPreview: result.ok ? result.finalAnswer.slice(0, 240) : undefined,
    error: result.ok ? undefined : result.error,
    modelEvents,
    usageEventCount: usageEvents.length
  }, null, 2));

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.finalAnswer.length).toBeGreaterThan(0);
  }
  expect(modelEvents).toContain("model.requested");
  expect(modelEvents).toContain("model.selected");
  expect(modelEvents).toContain("model.finished");
}, 30_000);

function loadDotEnv(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  const file = readFileSync(path, "utf8");

  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    values[key] = unquote(rawValue);
  }

  return values;
}

function unquote(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
