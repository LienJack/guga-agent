import http from "node:http";
import { afterAll, expect, test } from "vitest";
import { AgentEventType, createAgentRuntime } from "../packages/core/src";
import { createAiSdkProviderPlugin } from "../packages/provider-ai-sdk/src";

const requests: unknown[] = [];
const toolExecutions: Array<{ input: unknown; content: string }> = [];
const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "not found" } }));
    return;
  }

  const body = await readJson(request);
  requests.push(body);

  const hasToolResult = body.messages?.some((message: { role?: string }) => message.role === "tool");
  const responseBody = hasToolResult ? finalResponse(body) : toolCallResponse(body);

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(responseBody));
});

afterAll(async () => {
  if (server.listening) {
    await close(server);
  }
});

test("runs through the AI SDK bridge against a local OpenAI-compatible endpoint", async () => {
  await listen(server);
  const { port } = server.address() as { port: number };
  const baseURL = `http://127.0.0.1:${port}/v1`;

  const runtime = createAgentRuntime({
    model: createAiSdkProviderPlugin({
      id: "ai-sdk-demo",
      mode: "openai-compatible",
      modelId: "demo-model",
      baseURL,
      apiKey: "demo-key",
      metadata: {
        displayName: "Local OpenAI-compatible Demo Model",
        purposes: ["primary"],
        capabilities: { toolCalling: true, usage: "optional" }
      }
    })
  });

  runtime.registerTool({
    name: "echo",
    description: "Echo a value from the local demo model",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" }
      },
      required: ["value"],
      additionalProperties: false
    },
    effect: "read",
    execute(input) {
      const parsed = typeof input === "string" ? JSON.parse(input) : input;
      const value = parsed && typeof parsed === "object" && "value" in parsed ? parsed.value : "missing";
      const content = `echo:${String(value)}`;
      toolExecutions.push({ input, content });
      return { ok: true, content };
    }
  });

  const observedEvents: unknown[] = [];
  runtime.onEvent((event) => observedEvents.push(event));

  const result = await runtime.run({
    input: "Use the echo tool with value guga, then summarize the result.",
    runId: "demo-run"
  });

  const modelEvents = observedEvents
    .filter((event): event is { type: typeof AgentEventType.ModelEvent; event: { type: string } } =>
      isRecord(event) && event.type === AgentEventType.ModelEvent && isRecord(event.event) && typeof event.event.type === "string"
    )
    .map((event) => event.event.type);
  const providerErrors = observedEvents
    .filter((event): event is { type: typeof AgentEventType.ModelEvent; event: { type: string; error?: unknown } } =>
      isRecord(event) && event.type === AgentEventType.ModelEvent && isRecord(event.event) && event.event.type === "model.provider_error"
    )
    .map((event) => event.event.error);
  const agentEvents = observedEvents
    .filter((event): event is { type: string } => isRecord(event) && typeof event.type === "string")
    .map((event) => event.type);
  const firstRequest = requests[0] as { tools?: Array<{ function?: { name?: string }; name?: string }> } | undefined;
  const secondRequest = requests[1] as { messages?: Array<{ role?: string }> } | undefined;

  const summary = {
    ok: result.ok,
    finalAnswer: result.ok ? result.finalAnswer : undefined,
    error: result.ok ? undefined : result.error,
    baseURL,
    registeredModels: runtime.listModels?.(),
    httpRequestCount: requests.length,
    firstRequestTools: firstRequest?.tools?.map((tool) => tool.function?.name ?? tool.name) ?? [],
    secondRequestHasToolResult: secondRequest?.messages?.some((message) => message.role === "tool") ?? false,
    toolExecutions,
    providerErrors,
    modelEvents,
    agentEvents
  };

  await runtime.dispose();

  console.log("\nAI SDK bridge demo completed");
  console.log(JSON.stringify(summary, null, 2));

  expect(result).toMatchObject({
    ok: true,
    finalAnswer: "The Guga tool pipeline returned echo:guga."
  });
  expect(requests).toHaveLength(2);
  expect(summary.firstRequestTools).toEqual(["echo"]);
  expect(summary.secondRequestHasToolResult).toBe(true);
  expect(toolExecutions).toEqual([{ input: { value: "guga" }, content: "echo:guga" }]);
  expect(modelEvents).toContain("model.tool_intent");
  expect(modelEvents).toContain("model.usage");
});

function toolCallResponse(body: { model?: string }) {
  return {
    id: "chatcmpl-demo-tool",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? "demo-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-demo-echo",
              type: "function",
              function: {
                name: "echo",
                arguments: JSON.stringify({ value: "guga" })
              }
            }
          ]
        },
        finish_reason: "tool_calls"
      }
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 4,
      total_tokens: 16
    }
  };
}

function finalResponse(body: { messages?: Array<{ role?: string; content?: unknown }>; model?: string }) {
  const toolMessage = body.messages?.find((message) => message.role === "tool");
  const toolContent = typeof toolMessage?.content === "string"
    ? toolMessage.content
    : JSON.stringify(toolMessage?.content ?? "");

  return {
    id: "chatcmpl-demo-final",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? "demo-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: `The Guga tool pipeline returned ${toolContent}.`
        },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28
    }
  };
}

function readJson(request: http.IncomingMessage): Promise<{ messages?: Array<{ role?: string }>; model?: string }> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
