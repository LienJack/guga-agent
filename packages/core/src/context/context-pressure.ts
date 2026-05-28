import { AgentEventType } from "../contracts/events";
import type { ContextPressureDecision, ModelInputProjection } from "../contracts/context";

export function shouldEmitContextPressure(decision: ContextPressureDecision): boolean {
  return decision.level !== "none";
}

export function projectionCreatedEvent(projection: ModelInputProjection) {
  return {
    type: AgentEventType.ContextProjectionCreated,
    runId: projection.runId,
    turn: projection.turn,
    projection
  } as const;
}

export function contextPressureEvent(projection: ModelInputProjection) {
  return {
    type: AgentEventType.ContextPressure,
    runId: projection.runId,
    turn: projection.turn,
    projectionId: projection.id,
    decision: projection.pressure
  } as const;
}
