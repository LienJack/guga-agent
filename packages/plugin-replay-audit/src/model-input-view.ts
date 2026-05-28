import { AgentEventType, type AgentEvent, type DurableEventEnvelope, type JsonValue, type ProviderInputRecord, type ReplayDiagnostic, type ReplayModelInputResult } from "@guga-agent/core";

export type ModelInputViewResult = ReplayModelInputResult;

export function buildModelInputView(events: readonly DurableEventEnvelope[], request: { turn?: number } = {}): ModelInputViewResult {
  const projections = projectionEvents(events);
  const committed = events
    .filter((envelope) => {
      const event = envelope.payload as AgentEvent;
      return event.type === AgentEventType.ProviderInputCommitted
        && (request.turn === undefined || event.turn === request.turn);
    })
    .at(-1);

  if (!committed) {
    return {
      ok: true,
      projection: undefined,
      diagnostics: [{
        severity: "warning",
        code: "PROVIDER_INPUT_NOT_COMMITTED",
        message: request.turn === undefined
          ? "No provider-input committed fact was found in the replayed event path"
          : `No provider-input committed fact was found for turn ${request.turn}`
      }]
    };
  }

  const committedPayload = committed.payload as Extract<AgentEvent, { type: typeof AgentEventType.ProviderInputCommitted }>;
  const projection = projections.get(committedPayload.projectionId);
  if (!projection) {
    return {
      ok: true,
      projection: undefined,
      diagnostics: [{
        severity: "error",
        code: "PROJECTION_FACT_MISSING",
        message: `Provider input ${committed.eventId} references missing projection ${committedPayload.projectionId}`,
        eventId: committed.eventId,
        metadata: { projectionId: committedPayload.projectionId }
      }]
    };
  }

  return {
    ok: true,
    projection: {
      projectionId: projection.id,
      runId: committedPayload.runId,
      turn: committedPayload.turn,
      ...(projection.provider ? { provider: projection.provider } : {}),
      messages: structuredClone(projection.messages),
      tools: projection.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: structuredClone(tool.inputSchema) as JsonValue,
        effect: tool.effect
      })),
      sourceDescriptors: projection.sourceDescriptors.map(({ metadata: _metadata, ...descriptor }) => structuredClone(descriptor)),
      policyDecisions: structuredClone(projection.policyDecisions),
      ...(committedPayload.projectionHash ?? projection.hash ? { projectionHash: committedPayload.projectionHash ?? projection.hash } : {}),
      artifactRefs: committed.artifactRefs ?? []
    },
    diagnostics: []
  };
}

function projectionEvents(events: readonly DurableEventEnvelope[]): Map<string, Extract<AgentEvent, { type: typeof AgentEventType.ContextProjectionCreated }>["projection"]> {
  const projections = new Map<string, Extract<AgentEvent, { type: typeof AgentEventType.ContextProjectionCreated }>["projection"]>();
  for (const envelope of events) {
    const event = envelope.payload as AgentEvent;
    if (event.type === AgentEventType.ContextProjectionCreated) {
      projections.set(event.projection.id, event.projection);
    }
  }
  return projections;
}
