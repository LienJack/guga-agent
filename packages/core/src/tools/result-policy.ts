import { AgentEventType } from "../contracts/events";
import type {
  BudgetedToolResult,
  ToolCallCorrelation,
  ToolEvidenceRedaction,
  ToolEvidenceVerifier,
  ToolResultBudget,
  ToolResultEvidence
} from "../contracts/tool-runtime";
import type { ToolCall } from "../contracts/messages";
import type { ToolFailure, ToolResult } from "../contracts/tools";
import type { ToolDefinition } from "../contracts/tools";
import type { ToolResultReference } from "../contracts/tool-runtime";
import { InMemoryToolResultStore, type ToolResultStore } from "../context/tool-result-store";
import { createToolResultPreview } from "../context/tool-result-views";
import { EventBus } from "../events/event-bus";

export type ResultPolicyOptions = {
  eventBus?: EventBus;
  defaultBudget?: ToolResultBudget;
  store?: ToolResultStore;
};

export type ResultPolicyApplyOptions = {
  call: ToolCall;
  correlation: ToolCallCorrelation;
  result: ToolResult;
  tool?: ToolDefinition;
  budget?: ToolResultBudget;
};

export type SyntheticResultReason = "cancelled" | "skipped" | "denied" | "timeout";

export class ResultPolicy {
  private readonly eventBus: EventBus;
  private readonly defaultBudget: ToolResultBudget;
  private readonly store: ToolResultStore;

  constructor(options: ResultPolicyOptions = {}) {
    this.eventBus = options.eventBus ?? new EventBus();
    this.defaultBudget = options.defaultBudget ?? {};
    this.store = options.store ?? new InMemoryToolResultStore();
  }

  apply(options: ResultPolicyApplyOptions): BudgetedToolResult {
    const budget = options.budget ?? this.defaultBudget;
    const maxContentChars = budget.maxContentChars;
    if (maxContentChars === undefined) {
      return options.result;
    }

    const content = resultContent(options.result);
    if (content.length <= maxContentChars) {
      return options.result;
    }

    const reference = this.store.store({
      correlation: options.correlation,
      toolName: options.call.name,
      result: options.result,
      content,
      metadata: {
        budgetStrategy: budget.strategy ?? "truncate",
        providerRawPersistence: "descriptor-only"
      }
    });
    const preview = createToolResultPreview({
      call: options.call,
      result: options.result,
      ...(options.tool ? { tool: options.tool } : {}),
      content,
      maxContentChars,
      reference
    });

    const strategy = budget.strategy ?? "truncate";
    const redaction = defaultRedaction();
    const verifier = defaultVerifier();
    const audit = auditMetadata(strategy, reference, redaction, verifier);
    const evidence = evidenceFor({
      strategy,
      reference,
      originalContentChars: content.length,
      preview: preview.llmPreview,
      uiProjection: preview.uiProjection,
      notice: preview.notice,
      omittedContentChars: Math.max(0, content.length - maxContentChars),
      redaction,
      verifier,
      auditMetadata: audit
    });

    const result = strategy === "reference"
      ? referenceResult(options.result, reference, content.length, preview.llmPreview, preview.uiProjection, preview.notice, preview.rereadInstruction, audit, evidence, redaction, verifier)
      : truncateResult(options.result, maxContentChars, content.length, preview.llmPreview, preview.uiProjection, preview.notice, reference, preview.rereadInstruction, audit, evidence, redaction, verifier);

    this.eventBus.publish({
      type: AgentEventType.ToolResultBudgeted,
      runId: options.correlation.runId,
      turn: options.correlation.turn,
      correlation: options.correlation,
      call: options.call,
      result
    });

    return result;
  }

  synthetic(reason: SyntheticResultReason, message: string, details?: unknown): ToolFailure {
    const code = {
      cancelled: "TOOL_CANCELLED",
      skipped: "TOOL_SKIPPED",
      denied: "TOOL_PERMISSION_DENIED",
      timeout: "TOOL_TIMEOUT"
    }[reason];

    return {
      ok: false,
      error: {
        code,
        message,
        details
      },
      metadata: {
        synthetic: true,
        reason
      }
    };
  }
}

function resultContent(result: ToolResult): string {
  if (result.ok) {
    return result.content;
  }

  return typeof result.error.details === "string"
    ? result.error.details
    : result.error.message;
}

function truncateResult(
  result: ToolResult,
  maxContentChars: number,
  originalContentChars: number,
  previewContent: string,
  uiProjection: string,
  notice: string,
  reference: ToolResultReference,
  rereadInstruction: string | undefined,
  audit: Record<string, unknown>,
  evidence: ToolResultEvidence,
  redaction: ToolEvidenceRedaction,
  verifier: ToolEvidenceVerifier
): BudgetedToolResult {
  if (result.ok) {
    return {
      ...result,
      content: previewContent,
      budget: {
        applied: true,
        originalContentChars,
        notice,
        reference,
        ...(rereadInstruction ? { rereadInstruction } : {}),
        omittedContentChars: Math.max(0, originalContentChars - maxContentChars),
        view: {
          llmPreview: previewContent,
          uiProjection,
          auditMetadata: audit
        },
        evidence,
        redaction,
        verifier
      }
    };
  }

  return {
    ...result,
    error: {
      ...result.error,
      details: {
        truncated: true,
        originalContentChars,
        content: previewContent,
        reference
      }
    },
    budget: {
      applied: true,
      originalContentChars,
      notice,
      reference,
      ...(rereadInstruction ? { rereadInstruction } : {}),
      omittedContentChars: Math.max(0, originalContentChars - maxContentChars),
      view: {
        llmPreview: previewContent,
        uiProjection,
        auditMetadata: audit
      },
      evidence,
      redaction,
      verifier
    }
  };
}

function referenceResult(
  result: ToolResult,
  reference: ToolResultReference,
  originalContentChars: number,
  previewContent: string,
  uiProjection: string,
  previewNotice: string,
  rereadInstruction: string | undefined,
  audit: Record<string, unknown>,
  evidence: ToolResultEvidence,
  redaction: ToolEvidenceRedaction,
  verifier: ToolEvidenceVerifier
): BudgetedToolResult {
  const notice = `Tool output stored as reference: ${reference.id}`;

  if (result.ok) {
    return {
      ...result,
      content: `${previewContent}\n\n[${notice}]`,
      budget: {
        applied: true,
        originalContentChars,
        notice: `${notice}. ${previewNotice}`,
        reference,
        ...(rereadInstruction ? { rereadInstruction } : {}),
        omittedContentChars: originalContentChars,
        view: {
          llmPreview: previewContent,
          uiProjection,
          auditMetadata: audit
        },
        evidence,
        redaction,
        verifier
      }
    };
  }

  return {
    ...result,
    error: {
      ...result.error,
      details: {
        referenced: true,
        reference
      }
    },
    budget: {
      applied: true,
      originalContentChars,
      notice: `${notice}. ${previewNotice}`,
      reference,
      ...(rereadInstruction ? { rereadInstruction } : {}),
      omittedContentChars: originalContentChars,
      view: {
        llmPreview: previewContent,
        uiProjection,
        auditMetadata: audit
      },
      evidence,
      redaction,
      verifier
    }
  };
}

function evidenceFor(options: {
  strategy: "truncate" | "reference";
  reference: ToolResultReference;
  originalContentChars: number;
  preview: string;
  uiProjection: string;
  notice: string;
  omittedContentChars: number;
  redaction: ToolEvidenceRedaction;
  verifier: ToolEvidenceVerifier;
  auditMetadata: Record<string, unknown>;
}): ToolResultEvidence {
  const contentHash = contentHashFor(options.reference);
  return {
    raw: {
      source: options.reference.type,
      available: true,
      reference: options.reference,
      ...(contentHash ? { contentHash } : {}),
      originalContentChars: options.originalContentChars
    },
    model: {
      preview: options.preview,
      notice: options.notice,
      omittedContentChars: options.omittedContentChars
    },
    ui: {
      projection: options.uiProjection,
      reference: options.reference
    },
    audit: {
      metadata: options.auditMetadata,
      reference: options.reference,
      redaction: options.redaction,
      verifier: options.verifier
    }
  };
}

function auditMetadata(
  strategy: "truncate" | "reference",
  reference: ToolResultReference,
  redaction: ToolEvidenceRedaction,
  verifier: ToolEvidenceVerifier
): Record<string, unknown> {
  return {
    strategy,
    referenceType: reference.type,
    providerRawPersistence: "descriptor-only",
    rawAvailable: true,
    redaction,
    verifier,
    ...(reference.artifact
      ? {
          artifact: {
            artifactId: reference.artifact.artifactId,
            contentHash: reference.artifact.contentHash,
            sizeBytes: reference.artifact.sizeBytes,
            mimeType: reference.artifact.mimeType,
            privacyTags: reference.artifact.privacyTags,
            retention: reference.artifact.retention,
            redaction: reference.artifact.redaction
          }
        }
      : {})
  };
}

function contentHashFor(reference: ToolResultReference): string | undefined {
  if (reference.artifact) {
    return reference.artifact.contentHash.value;
  }
  const hash = reference.metadata?.contentHash;
  return typeof hash === "string" ? hash : undefined;
}

function defaultRedaction(): ToolEvidenceRedaction {
  return { state: "none" };
}

function defaultVerifier(): ToolEvidenceVerifier {
  return { status: "unverified" };
}
