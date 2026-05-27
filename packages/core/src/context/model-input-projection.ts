import {
  ContextSourceKind,
  ContextSourcePriority,
  type ContextPolicyDecision,
  type ContextSourceDescriptor,
  type ModelInputProjection
} from "../contracts/context";
import type { CoreMessage } from "../contracts/messages";
import type { ModelIdentifier, ModelMetadata, ModelPurpose } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";
import { ContextBudgeter, estimateMessageTokens, estimateTextTokens } from "./context-budgeter";
import { orderContextSources } from "./context-source-ordering";
import { computeProjectionHash } from "./projection-hash";
import { ensureToolPairingSafety } from "./tool-pairing-safety";

export type ModelInputProjectorOptions = {
  budgeter?: ContextBudgeter;
  idFactory?: () => string;
};

export type AssembleModelInputProjectionOptions = {
  runId: string;
  turn: number;
  messages: readonly CoreMessage[];
  tools: readonly ToolDefinition[];
  model?: Partial<ModelIdentifier> & {
    purpose?: ModelPurpose;
    metadata?: ModelMetadata;
  };
  additionalSources?: readonly ContextSourceDescriptor[];
  policyDecisions?: ContextPolicyDecision[];
  reservedOutputTokens?: number;
};

export class ModelInputProjector {
  private readonly budgeter: ContextBudgeter;
  private readonly idFactory: () => string;

  constructor(options: ModelInputProjectorOptions = {}) {
    this.budgeter = options.budgeter ?? new ContextBudgeter();
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  assemble(options: AssembleModelInputProjectionOptions): ModelInputProjection {
    const pairing = ensureToolPairingSafety(options.messages);
    const messages = pairing.messages;
    const tools = [...options.tools];
    const pairingDecisions: ContextPolicyDecision[] = pairing.decisions
      .filter((decision) => decision.type !== "valid")
      .map((decision) => ({
        id: `pairing-${decision.batchId ?? "orphan"}`,
        kind: decision.type === "repair" ? "pairing-repair" : "pairing-refuse",
        phase: "context.assemble",
        sourceIds: decision.retainedToolCallIds,
        reason: decision.reason,
        metadata: decision
      }));
    const sources = orderContextSources([
      ...sourceDescriptorsFor(messages, tools),
      ...(options.additionalSources ? [...options.additionalSources] : [])
    ]);
    const budget = this.budgeter.estimate({
      messages,
      tools,
      sources,
      ...(options.model?.metadata ? { modelMetadata: options.model.metadata } : {}),
      ...(options.reservedOutputTokens !== undefined ? { reservedOutputTokens: options.reservedOutputTokens } : {})
    });
    const projectionId = `projection-${this.idFactory()}`;
    const pressure = this.budgeter.pressureFor(
      `${projectionId}-pressure`,
      budget,
      sources.map((source) => source.id)
    );

    const projection: ModelInputProjection = {
      id: projectionId,
      runId: options.runId,
      turn: options.turn,
      messages,
      tools,
      sourceDescriptors: sources,
      budget,
      pressure,
      policyDecisions: [...pairingDecisions, ...(options.policyDecisions ? [...options.policyDecisions] : [])],
      ...(options.model ? { provider: options.model } : {})
    };
    return {
      ...projection,
      hash: computeProjectionHash(projection)
    };
  }
}

function sourceDescriptorsFor(messages: readonly CoreMessage[], tools: readonly ToolDefinition[]): ContextSourceDescriptor[] {
  const lastMessageIndex = messages.length - 1;
  const descriptors = messages.map((message, index) => messageSource(message, index, lastMessageIndex));
  for (const tool of tools) {
    descriptors.push(toolSource(tool));
  }
  return descriptors;
}

function messageSource(message: CoreMessage, index: number, lastMessageIndex: number): ContextSourceDescriptor {
  const id = `message-${index}`;
  const base = {
    id,
    tokenEstimate: {
      status: "estimated" as const,
      tokens: estimateMessageTokens(message)
    },
    contentHash: simpleContentHash(JSON.stringify(message)),
    messageIndexes: [index],
    modelVisible: true
  };

  switch (message.role) {
    case "system":
      return {
        ...base,
        kind: ContextSourceKind.SystemPrompt,
        priority: ContextSourcePriority.Critical,
        provenance: { origin: "core" },
        protected: true
      };
    case "user":
      return {
        ...base,
        kind: reinjectedKind(message.content) ??
          (message.content.includes("[Compaction summary:")
          ? ContextSourceKind.CompactionSummary
          : index === lastMessageIndex ? ContextSourceKind.PendingTurn : ContextSourceKind.History),
        priority: reinjectedKind(message.content)
          ? ContextSourcePriority.High
          : message.content.includes("[Compaction summary:")
          ? ContextSourcePriority.Medium
          : index === lastMessageIndex ? ContextSourcePriority.High : ContextSourcePriority.Medium,
        provenance: reinjectedKind(message.content)
          ? { origin: "host", metadata: { reinjected: true } }
          : message.content.includes("[Compaction summary:")
          ? { origin: "summary" }
          : { origin: "core" },
        protected: !!reinjectedKind(message.content) || (!message.content.includes("[Compaction summary:") && index === lastMessageIndex)
      };
    case "assistant":
      return {
        ...base,
        kind: ContextSourceKind.History,
        priority: message.toolCalls ? ContextSourcePriority.High : ContextSourcePriority.Medium,
        provenance: { origin: "core" },
        protected: !!message.toolCalls
      };
    case "tool":
      return {
        ...base,
        kind: ContextSourceKind.ToolResultPreview,
        priority: ContextSourcePriority.High,
        provenance: { origin: "tool", toolCallId: message.toolCallId },
        protected: true,
        references: toolPreviewReferences(message)
      };
  }
}

function reinjectedKind(content: string): ContextSourceKind | undefined {
  if (content.startsWith("[Reinjected host_context:")) {
    return ContextSourceKind.HostContext;
  }
  if (content.startsWith("[Reinjected resource_file:")) {
    return ContextSourceKind.ResourceFile;
  }
  if (content.startsWith("[Reinjected plan_todo:")) {
    return ContextSourceKind.PlanTodo;
  }
  if (content.startsWith("[Reinjected skill_body:")) {
    return ContextSourceKind.SkillBody;
  }
  if (content.startsWith("[Reinjected active_tool:")) {
    return ContextSourceKind.ActiveTool;
  }
  if (content.startsWith("[Reinjected permission_mode:")) {
    return ContextSourceKind.PermissionMode;
  }
  return undefined;
}

function toolSource(tool: ToolDefinition): ContextSourceDescriptor {
  return {
    id: `tool-${tool.name}`,
    kind: ContextSourceKind.ActiveTool,
    priority: ContextSourcePriority.High,
    provenance: {
      origin: tool.runtime?.source?.kind === "plugin" ? "plugin" : "core",
      ...(tool.runtime?.source?.pluginId ? { pluginId: tool.runtime.source.pluginId } : {}),
      metadata: {
        effect: tool.effect,
        renderer: tool.runtime?.renderer
      }
    },
    tokenEstimate: {
      status: "estimated",
      tokens:
        estimateTextTokens(tool.name) +
        estimateTextTokens(tool.description) +
        estimateTextTokens(JSON.stringify(tool.inputSchema))
    },
    contentHash: simpleContentHash(`${tool.name}:${tool.description}:${JSON.stringify(tool.inputSchema)}`),
    modelVisible: true,
    metadata: {
      toolName: tool.name
    }
  };
}

function toolPreviewReferences(message: Extract<CoreMessage, { role: "tool" }>) {
  return [
    {
      type: "tool-result" as const,
      id: message.toolCallId,
      label: `${message.name} result`,
      rereadInstruction: `Ask to rerun or reread tool result ${message.toolCallId} if full output is needed.`
    }
  ];
}

function simpleContentHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
