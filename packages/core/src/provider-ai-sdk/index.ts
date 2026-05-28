import { generateText as defaultGenerateText, gateway } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ToolCall } from "../contracts/messages";
import type { LocalModelPlugin, LocalPlugin } from "../contracts/plugins";
import type { ModelMetadata, Provider, ProviderRequest, ProviderResponse } from "../contracts/provider";
import { mapCoreMessagesToAiSdk } from "./message-mapper";
import { mapToolsToAiSdk } from "./tool-mapper";
import { mapAiSdkError, mapAiSdkFinishReason, mapAiSdkUsage } from "./usage-error-mapper";

export type AiSdkBridgeMode = "gateway" | "openai-compatible" | "openai" | "anthropic";

export type AiSdkProviderConfig = {
  id?: string;
  modelId: string;
  mode: AiSdkBridgeMode;
  apiKey?: string;
  baseURL?: string;
  name?: string;
  headers?: Record<string, string>;
  providerOptions?: Record<string, unknown>;
  metadata?: Omit<ModelMetadata, "providerId" | "modelId">;
};

export type AiSdkGenerateText = (options: Record<string, unknown>) => Promise<AiSdkGenerateTextResult>;

export type AiSdkGenerateTextResult = {
  text?: string;
  toolCalls?: AiSdkToolCallLike[];
  usage?: Parameters<typeof mapAiSdkUsage>[0];
  finishReason?: unknown;
  providerMetadata?: unknown;
  response?: {
    id?: string;
  };
};

export type AiSdkToolCallLike = {
  toolCallId?: string;
  id?: string;
  toolName?: string;
  name?: string;
  input?: unknown;
  args?: unknown;
};

export type AiSdkProviderFactoryOptions = {
  generateText?: AiSdkGenerateText;
  modelFactory?: (config: AiSdkProviderConfig) => unknown;
};

export type BuiltInAiSdkProviderCapabilities = {
  provider: Provider;
  model: ModelMetadata;
};

export function createAiSdkProvider(
  config: AiSdkProviderConfig,
  options: AiSdkProviderFactoryOptions = {}
): Provider {
  const providerId = config.id ?? "ai-sdk";
  const generateText = options.generateText ?? ((callOptions) => defaultGenerateText(callOptions as never) as Promise<AiSdkGenerateTextResult>);
  const modelFactory = options.modelFactory ?? createModel;

  return {
    id: providerId,
    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      const modelId = request.model?.modelId ?? config.modelId;
      const model = modelFactory({ ...config, modelId });

      try {
        const result = await generateText({
          model,
          messages: mapCoreMessagesToAiSdk(request.messages),
          tools: mapToolsToAiSdk(request.tools),
          toolChoice: request.tools.length > 0 ? "auto" : "none",
          maxRetries: 0,
          abortSignal: request.signal,
          providerOptions: config.providerOptions
        });

        return mapAiSdkResultToProviderResponse(result);
      } catch (error) {
        return {
          type: "failure",
          error: mapAiSdkError(error, {
            providerId,
            modelId
          })
        };
      }
    }
  };
}

export function createAiSdkProviderPlugin(
  config: AiSdkProviderConfig,
  options: AiSdkProviderFactoryOptions = {}
): LocalModelPlugin {
  const provider = createAiSdkProvider(config, options);
  const metadata: ModelMetadata = {
    providerId: provider.id,
    modelId: config.modelId,
    ...(config.metadata ?? {})
  };

  return {
    id: provider.id,
    name: "AI SDK Provider Bridge",
    model: {
      providerId: provider.id,
      modelId: config.modelId
    },
    init(context) {
      context.registerProvider(provider);
      context.registerModel?.(metadata);
    }
  };
}

export function createBuiltInAiSdkProviderCapabilities(
  config: AiSdkProviderConfig,
  options: AiSdkProviderFactoryOptions = {}
): BuiltInAiSdkProviderCapabilities {
  const provider = createAiSdkProvider(config, options);
  return {
    provider,
    model: {
      providerId: provider.id,
      modelId: config.modelId,
      ...(config.metadata ?? {})
    }
  };
}

export function mapAiSdkResultToProviderResponse(result: AiSdkGenerateTextResult): ProviderResponse {
  const usage = mapAiSdkUsage(result.usage);
  const finishReason = mapAiSdkFinishReason(result.finishReason);
  const raw = result.providerMetadata
    ? [{ label: "ai-sdk.providerMetadata", value: result.providerMetadata }]
    : undefined;

  const toolCalls = (result.toolCalls ?? []).map(mapAiSdkToolCall);
  if (toolCalls.length > 0) {
    return {
      type: "tool_calls",
      toolCalls,
      ...(result.text ? { content: result.text } : {}),
      ...(usage ? { usage } : {}),
      finishReason: "tool-calls",
      ...(raw ? { raw } : {})
    };
  }

  return {
    type: "final",
    content: result.text ?? "",
    ...(usage ? { usage } : {}),
    finishReason,
    ...(raw ? { raw } : {})
  };
}

export function createModel(config: AiSdkProviderConfig): unknown {
  if (config.mode === "gateway") {
    return gateway(config.modelId);
  }

  if (config.mode === "openai") {
    return createOpenAI(openAiSettings(config))(config.modelId);
  }

  if (config.mode === "anthropic") {
    return createAnthropic(openAiSettings(config))(config.modelId);
  }

  return createOpenAICompatible({
    name: config.name ?? config.id ?? "openai-compatible",
    baseURL: config.baseURL ?? "http://localhost:11434/v1",
    ...openAiSettings(config)
  })(config.modelId);
}

function mapAiSdkToolCall(call: AiSdkToolCallLike): ToolCall {
  const id = call.toolCallId ?? call.id;
  const name = call.toolName ?? call.name;

  if (!id || !name) {
    return {
      id: id ?? "ai-sdk-tool-call",
      name: name ?? "unknown",
      input: call.input ?? call.args ?? {}
    };
  }

  return {
    id,
    name,
    input: call.input ?? call.args ?? {}
  };
}

function openAiSettings(config: AiSdkProviderConfig): Record<string, string | Record<string, string>> {
  const settings: Record<string, string | Record<string, string>> = {};
  if (config.apiKey !== undefined) {
    settings.apiKey = config.apiKey;
  }
  if (config.baseURL !== undefined) {
    settings.baseURL = config.baseURL;
  }
  if (config.headers !== undefined) {
    settings.headers = config.headers;
  }
  return settings;
}
