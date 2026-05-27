import type { AgentEvent } from "../contracts/events";
import type {
  ArtifactReference,
  DurableEventActor,
  DurableEventEnvelope,
  DurableEventProvenance,
  DurableEventSource,
  EventAppendConflict,
  EventAppendResult,
  EventStore,
  JsonObject
} from "../contracts/persistence";
import { computeDurableEventRecordHash, createDurableEventEnvelope } from "../persistence/durable-event-envelope";

export type EventListener = (event: AgentEvent) => void;

export type DurableEventSessionContext = {
  sessionId: string;
  branchId: string;
};

export type DurableEventContext = {
  eventStore?: EventStore | undefined;
  session?: DurableEventSessionContext;
  actor?: DurableEventActor | undefined;
  source?: DurableEventSource | undefined;
};

export type DurableEventContextResolver = (event: AgentEvent | JsonObject) => DurableEventContext;

export type DurablePublishOptions = {
  eventType?: string;
  idempotencyKey?: string;
  actor?: DurableEventActor;
  source?: DurableEventSource;
  provenance?: DurableEventProvenance;
  artifactRefs?: ArtifactReference[];
  metadata?: JsonObject;
};

export type DurablePublishResult =
  | {
      ok: true;
      status: "appended" | "idempotent_replay" | "memory_only";
      event?: DurableEventEnvelope;
      streamRevision?: number;
    }
  | {
      ok: false;
      status: EventAppendConflict["status"] | "unavailable";
      message: string;
      details?: unknown;
    };

export class EventBus {
  readonly events: AgentEvent[] = [];
  private readonly listeners = new Set<EventListener>();
  private readonly durableContext: DurableEventContextResolver | undefined;

  constructor(options: { durableContext?: DurableEventContextResolver } = {}) {
    this.durableContext = options.durableContext;
  }

  publish(event: AgentEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async publishDurable(event: AgentEvent, options: DurablePublishOptions = {}): Promise<DurablePublishResult> {
    const result = await this.appendDurableRecord(event, options);
    if (!result.ok) {
      return result;
    }
    this.publish(event);
    return result;
  }

  async appendDurableRecord(
    payload: AgentEvent | JsonObject,
    options: DurablePublishOptions = {}
  ): Promise<DurablePublishResult> {
    const context = this.durableContext?.(payload);
    if (!context?.eventStore || !context.session) {
      return { ok: true, status: "memory_only" };
    }

    const streamId = `session/${context.session.sessionId}`;
    const read = await context.eventStore.readStream(streamId);
    if (!read.ok && read.status !== "not_found") {
      return {
        ok: false,
        status: "unavailable",
        message: read.diagnostics[0]?.message ?? `Unable to read durable event stream ${streamId}`,
        details: read
      };
    }

    const existingEvents = read.ok ? read.events : [];
    const previous = existingEvents.at(-1);
    const streamRevision = previous ? previous.streamRevision + 1 : 0;
    const envelope = createDurableEventEnvelope({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      eventType: options.eventType ?? eventTypeFromPayload(payload),
      streamId,
      streamRevision,
      sessionId: context.session.sessionId,
      branchId: context.session.branchId,
      ...runTurnFromPayload(payload),
      parentEventId: previous?.eventId ?? null,
      previousEventHash: previous
        ? { algorithm: "sha256", value: computeDurableEventRecordHash(previous) }
        : null,
      createdAt: new Date().toISOString(),
      actor: options.actor ?? context.actor ?? { type: "runtime", id: "guga-core" },
      source: options.source ?? context.source ?? { type: "runtime", id: "guga-core" },
      ...(options.idempotencyKey ? { idempotency: { key: options.idempotencyKey, scope: "stream" } } : {}),
      ...(options.provenance ? { provenance: options.provenance } : {}),
      ...(options.artifactRefs ? { artifactRefs: options.artifactRefs } : {}),
      payload
    });

    const append = await context.eventStore.append(envelope, {
      expectedRevision: previous ? previous.streamRevision : "no-stream",
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {})
    });
    return appendResult(append);
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.events.length = 0;
  }

  dispose(): void {
    this.clear();
    this.listeners.clear();
  }
}

function appendResult(result: EventAppendResult): DurablePublishResult {
  if (result.ok) {
    return {
      ok: true,
      status: result.status,
      event: result.event,
      streamRevision: result.streamRevision
    };
  }

  if (result.status === "unavailable") {
    return {
      ok: false,
      status: "unavailable",
      message: result.reason,
      details: result
    };
  }

  return {
    ok: false,
    status: result.status,
    message: durableConflictMessage(result),
    details: result
  };
}

function durableConflictMessage(result: EventAppendConflict): string {
  if (result.status === "expected_revision_conflict") {
    return `Durable append expected revision ${String(result.expectedRevision)} but stream is at ${String(result.actualRevision)}`;
  }
  return `Durable append idempotency conflict for ${result.key}`;
}

function eventTypeFromPayload(payload: AgentEvent | JsonObject): string {
  return typeof payload.type === "string" && payload.type.length > 0 ? payload.type : "event.unknown";
}

function runTurnFromPayload(payload: AgentEvent | JsonObject): { runId?: string; turn?: number } {
  const record = payload as Record<string, unknown>;
  return {
    ...(typeof record.runId === "string" ? { runId: record.runId } : {}),
    ...(typeof record.turn === "number" ? { turn: record.turn } : {})
  };
}
