import { join } from "node:path";
import {
  computeDurableEventRecordHash,
  upcastDurableEventEnvelope,
  validateDurableEventEnvelope,
  type DurableEventEnvelope,
  type DurableEventUpcaster,
  type EventAppendOptions,
  type EventAppendResult,
  type EventStore,
  type EventStreamReadOptions,
  type EventStreamReadResult,
  type ExpectedRevision,
  type HashDescriptor,
  type StoreCorruptionDiagnostic
} from "@guga-agent/core";
import { appendJsonlRecord, readJsonlRecords, safePathSegment } from "./jsonl-corruption";

export type JsonlEventStoreOptions = {
  rootDir: string;
  upcasters?: DurableEventUpcaster[];
};

type EventJsonlRecord = {
  kind: "event";
  envelope: DurableEventEnvelope;
};

const queues = new Map<string, Promise<unknown>>();

export class JsonlEventStore implements EventStore {
  private readonly rootDir: string;
  private readonly upcasters: DurableEventUpcaster[];

  constructor(options: JsonlEventStoreOptions) {
    this.rootDir = options.rootDir;
    this.upcasters = options.upcasters ?? [];
  }

  append(event: DurableEventEnvelope, options: EventAppendOptions = {}): Promise<EventAppendResult> {
    return enqueue(this.pathForStream(event.streamId), () => this.appendNow(event, options));
  }

  async readStream(streamId: string, options: EventStreamReadOptions = {}): Promise<EventStreamReadResult> {
    const result = await this.readRawStream(streamId);
    if (!result.ok) {
      return { ok: false, status: "corrupt", diagnostics: result.diagnostics };
    }

    const sliced = applyReadOptions(result.events, options);
    const diagnostics = [...result.diagnostics];
    const targetSchemaVersion = options.targetSchemaVersion;
    const events: DurableEventEnvelope[] = [];
    if (targetSchemaVersion !== undefined) {
      for (const event of sliced) {
        const upcast = upcastDurableEventEnvelope(event, {
          targetSchemaVersion,
          upcasters: this.upcasters
        });
        if (!upcast.ok) {
          return {
            ok: false,
            status: "upcaster_failed",
            diagnostics: [{
              kind: "schema_invalid",
              streamId,
              eventId: event.eventId,
              revision: event.streamRevision,
              message: upcast.message,
              recoverable: false
            }]
          };
        }
        diagnostics.push(...upcast.diagnostics.map((diagnostic) => ({
          kind: "schema_invalid" as const,
          streamId,
          eventId: diagnostic.eventId,
          message: diagnostic.message ?? `Upcast durable event from ${diagnostic.fromSchemaVersion} to ${diagnostic.toSchemaVersion}`,
          recoverable: true,
          metadata: {
            fromSchemaVersion: diagnostic.fromSchemaVersion,
            toSchemaVersion: diagnostic.toSchemaVersion
          }
        })));
        events.push(upcast.envelope);
      }
    } else {
      events.push(...sliced);
    }

    return {
      ok: true,
      events,
      nextRevision: result.events.length,
      ...(diagnostics.length > 0 ? { diagnostics } : {})
    };
  }

  private async appendNow(event: DurableEventEnvelope, options: EventAppendOptions): Promise<EventAppendResult> {
    const validation = validateDurableEventEnvelope(event);
    if (!validation.ok) {
      return {
        ok: false,
        status: "unavailable",
        reason: `Invalid durable event envelope: ${validation.issues.map((issue) => `${issue.path} ${issue.message}`).join(", ")}`
      };
    }

    const existing = await this.readRawStream(event.streamId);
    if (!existing.ok) {
      return {
        ok: false,
        status: "unavailable",
        reason: existing.diagnostics.map((diagnostic) => diagnostic.message).join("; ")
      };
    }
    const appendBlocker = existing.diagnostics.find((diagnostic) => diagnostic.kind === "partial_tail");
    if (appendBlocker) {
      return {
        ok: false,
        status: "unavailable",
        reason: `Stream ${event.streamId} has an unrepaired partial JSONL tail; repair or truncate before appending. ${appendBlocker.message}`
      };
    }

    const key = options.idempotencyKey ?? event.idempotency?.key;
    if (key) {
      const replay = existing.events.find((candidate) => (candidate.idempotency?.key ?? "") === key);
      if (replay && hashEquals(replay.payloadHash, event.payloadHash)) {
        return { ok: true, status: "idempotent_replay", event: replay, streamRevision: replay.streamRevision };
      }
      if (replay) {
        return {
          ok: false,
          status: "idempotency_conflict",
          key,
          existingEventId: replay.eventId,
          existingPayloadHash: replay.payloadHash,
          attemptedEventId: event.eventId,
          attemptedPayloadHash: event.payloadHash
        };
      }
    }

    const expected = options.expectedRevision ?? "any";
    const actual = actualRevision(existing.events);
    if (!matchesExpectedRevision(expected, actual)) {
      return {
        ok: false,
        status: "expected_revision_conflict",
        expectedRevision: options.expectedRevision,
        actualRevision: actual
      };
    }

    const last = existing.events.at(-1);
    const chainDiagnostic = validateAppendChain(event, last);
    if (chainDiagnostic) {
      return { ok: false, status: "unavailable", reason: chainDiagnostic.message };
    }

    try {
      await appendJsonlRecord(this.pathForStream(event.streamId), { kind: "event", envelope: event });
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        reason: error instanceof Error ? error.message : `Unable to append stream ${event.streamId}`
      };
    }
    return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
  }

  private async readRawStream(streamId: string): Promise<{
    ok: true;
    events: DurableEventEnvelope[];
    diagnostics: StoreCorruptionDiagnostic[];
  } | {
    ok: false;
    diagnostics: StoreCorruptionDiagnostic[];
  }> {
    const parsed = await readJsonlRecords<EventJsonlRecord>(this.pathForStream(streamId), {
      corruptionContext: { streamId },
      describeRecord(record) {
        return isEventRecord(record) ? record : undefined;
      }
    });
    if (!parsed.ok) {
      return { ok: false, diagnostics: parsed.diagnostics };
    }

    const diagnostics = [...parsed.diagnostics];
    const events: DurableEventEnvelope[] = [];
    for (const [index, record] of parsed.records.entries()) {
      const event = record.envelope;
      const validation = validateDurableEventEnvelope(event);
      if (!validation.ok) {
        return {
          ok: false,
          diagnostics: [{
            kind: "schema_invalid",
            streamId,
            eventId: event.eventId,
            revision: event.streamRevision,
            message: validation.issues.map((issue) => `${issue.path} ${issue.message}`).join(", "),
            recoverable: false
          }]
        };
      }
      if (event.streamId !== streamId || event.streamRevision !== index) {
        return {
          ok: false,
          diagnostics: [{
            kind: "hash_chain_mismatch",
            streamId,
            eventId: event.eventId,
            revision: event.streamRevision,
            message: `Unexpected stream identity or revision at line ${index + 1}`,
            recoverable: false,
            metadata: { expectedRevision: index, actualRevision: event.streamRevision, actualStreamId: event.streamId }
          }]
        };
      }
      const previous = events.at(-1);
      const chainDiagnostic = validateStoredChain(event, previous);
      if (chainDiagnostic) {
        return { ok: false, diagnostics: [chainDiagnostic] };
      }
      events.push(event);
    }

    return { ok: true, events, diagnostics };
  }

  private pathForStream(streamId: string): string {
    return join(this.rootDir, "events", `${safePathSegment(streamId)}.jsonl`);
  }
}

function isEventRecord(record: unknown): record is EventJsonlRecord {
  return Boolean(record && typeof record === "object" && (record as { kind?: unknown }).kind === "event" && "envelope" in record);
}

function matchesExpectedRevision(expected: ExpectedRevision, actual: number | "no-stream"): boolean {
  if (expected === "any") {
    return true;
  }
  if (expected === "no-stream") {
    return actual === "no-stream";
  }
  return actual === expected;
}

function actualRevision(events: DurableEventEnvelope[]): number | "no-stream" {
  return events.length === 0 ? "no-stream" : events.length - 1;
}

function validateAppendChain(event: DurableEventEnvelope, previous: DurableEventEnvelope | undefined): StoreCorruptionDiagnostic | undefined {
  if (previous && event.streamRevision !== previous.streamRevision + 1) {
    return chainDiagnostic(event, `Append revision ${event.streamRevision} does not follow ${previous.streamRevision}`);
  }
  if (!previous && event.streamRevision !== 0) {
    return chainDiagnostic(event, "First stream event must have revision 0");
  }
  return validateStoredChain(event, previous);
}

function validateStoredChain(event: DurableEventEnvelope, previous: DurableEventEnvelope | undefined): StoreCorruptionDiagnostic | undefined {
  const expectedPreviousHash: HashDescriptor | null = previous
    ? { algorithm: "sha256", value: computeDurableEventRecordHash(previous) }
    : null;

  if (!hashEquals(event.previousEventHash, expectedPreviousHash)) {
    return chainDiagnostic(event, "Durable event hash chain mismatch");
  }
  return undefined;
}

function chainDiagnostic(event: DurableEventEnvelope, message: string): StoreCorruptionDiagnostic {
  return {
    kind: "hash_chain_mismatch",
    streamId: event.streamId,
    eventId: event.eventId,
    revision: event.streamRevision,
    message,
    recoverable: false
  };
}

function hashEquals(left: HashDescriptor | null, right: HashDescriptor | null): boolean {
  return left?.algorithm === right?.algorithm && left?.value === right?.value;
}

function applyReadOptions(events: DurableEventEnvelope[], options: EventStreamReadOptions): DurableEventEnvelope[] {
  const direction = options.direction ?? "forwards";
  const fromRevision = options.fromRevision ?? (direction === "forwards" ? 0 : Math.max(0, events.length - 1));
  const candidates = direction === "forwards"
    ? events.filter((event) => event.streamRevision >= fromRevision)
    : [...events].reverse().filter((event) => event.streamRevision <= fromRevision);
  return options.limit === undefined ? candidates : candidates.slice(0, options.limit);
}

function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  queues.set(key, next.catch(() => undefined));
  return next;
}
