import type {
  DurableEventEnvelope,
  DurableEventUpcastResult,
  DurableEventUpcaster,
  HashDescriptor,
  JsonValue
} from "../contracts/persistence";

export type DurableEventValidationIssue = {
  path: string;
  message: string;
};

export type DurableEventValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      issues: DurableEventValidationIssue[];
    };

export type CreateDurableEventEnvelopeInput<TPayload> =
  Omit<DurableEventEnvelope<TPayload>, "eventType" | "payloadHash"> &
    Partial<Pick<DurableEventEnvelope<TPayload>, "eventType" | "payloadHash">>;

export function createDurableEventEnvelope<TPayload>(
  input: CreateDurableEventEnvelopeInput<TPayload>
): DurableEventEnvelope<TPayload> {
  const normalizedPayload = normalizeDurableJson(input.payload);
  return {
    ...input,
    eventType: input.eventType ?? eventTypeFromPayload(input.payload),
    payloadHash: hashJson(normalizedPayload)
  };
}

export function validateDurableEventEnvelope(envelope: unknown): DurableEventValidationResult {
  const issues: DurableEventValidationIssue[] = [];
  if (!isRecord(envelope)) {
    return { ok: false, issues: [{ path: "$", message: "Envelope must be an object" }] };
  }

  requireNonEmptyString(envelope, "eventId", issues);
  requireNonEmptyString(envelope, "eventType", issues);
  requireNonEmptyString(envelope, "streamId", issues);
  requireNonNegativeInteger(envelope, "streamRevision", issues);
  requireNonEmptyString(envelope, "sessionId", issues);
  requireNonEmptyString(envelope, "branchId", issues);
  requireNumber(envelope, "schemaVersion", issues);
  requireNonEmptyString(envelope, "createdAt", issues);
  requireRecordWithType(envelope, "actor", issues);
  requireRecordWithType(envelope, "source", issues);

  if (!("parentEventId" in envelope)) {
    issues.push({ path: "parentEventId", message: "parentEventId is required and may be null" });
  }
  if (!("previousEventHash" in envelope)) {
    issues.push({ path: "previousEventHash", message: "previousEventHash is required and may be null" });
  }
  if (!("payload" in envelope)) {
    issues.push({ path: "payload", message: "payload is required" });
  }
  if (!isHashDescriptor(envelope.payloadHash)) {
    issues.push({ path: "payloadHash", message: "payloadHash must be a sha256 hash descriptor" });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function normalizeDurableJson(value: unknown): JsonValue {
  return normalizeValue(value, new WeakSet<object>()) ?? null;
}

export function computeDurableEventRecordHash(envelope: DurableEventEnvelope): string {
  return stableHash(stableStringify(normalizeDurableJson(envelope)));
}

export function upcastDurableEventEnvelope(
  envelope: DurableEventEnvelope,
  options: { targetSchemaVersion: number; upcasters: DurableEventUpcaster[] }
): DurableEventUpcastResult {
  const diagnostics: DurableEventUpcastResult["diagnostics"] = [];
  let current = cloneEnvelope(envelope);

  if (current.schemaVersion === options.targetSchemaVersion) {
    return { ok: true, status: "current", envelope: current, diagnostics };
  }

  if (current.schemaVersion > options.targetSchemaVersion) {
    return {
      ok: false,
      status: "unknown_schema",
      fromSchemaVersion: current.schemaVersion,
      toSchemaVersion: options.targetSchemaVersion,
      eventId: current.eventId,
      message: `Envelope schema ${current.schemaVersion} is newer than target ${options.targetSchemaVersion}`,
      diagnostics
    };
  }

  while (current.schemaVersion < options.targetSchemaVersion) {
    const upcaster = options.upcasters.find((candidate) => candidate.fromSchemaVersion === current.schemaVersion);
    if (!upcaster) {
      return {
        ok: false,
        status: "upcaster_missing",
        fromSchemaVersion: current.schemaVersion,
        toSchemaVersion: options.targetSchemaVersion,
        eventId: current.eventId,
        message: `No durable event upcaster registered from schema ${current.schemaVersion}`,
        diagnostics
      };
    }

    try {
      const next = upcaster.upcast(cloneEnvelope(current));
      diagnostics.push({
        fromSchemaVersion: upcaster.fromSchemaVersion,
        toSchemaVersion: upcaster.toSchemaVersion,
        eventId: current.eventId
      });
      current = next;
    } catch (error) {
      return {
        ok: false,
        status: "upcaster_failed",
        fromSchemaVersion: upcaster.fromSchemaVersion,
        toSchemaVersion: upcaster.toSchemaVersion,
        eventId: current.eventId,
        message: error instanceof Error ? error.message : "Durable event upcaster failed",
        diagnostics
      };
    }
  }

  return { ok: true, status: "upcasted", envelope: current, diagnostics };
}

function eventTypeFromPayload(payload: unknown): string {
  if (isRecord(payload) && typeof payload.type === "string" && payload.type.length > 0) {
    return payload.type;
  }
  return "event.unknown";
}

function hashJson(value: JsonValue): HashDescriptor {
  return {
    algorithm: "sha256",
    value: stableHash(stableStringify(value))
  };
}

function normalizeValue(value: unknown, seen: WeakSet<object>): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    const output: Record<string, JsonValue> = {
      name: value.name,
      message: value.message
    };
    const cause = normalizeValue("cause" in value ? value.cause : undefined, seen);
    if (cause !== undefined) {
      output.cause = cause;
    }
    for (const key of Object.keys(value).sort()) {
      const normalized = normalizeValue((value as unknown as Record<string, unknown>)[key], seen);
      if (normalized !== undefined) {
        output[key] = normalized;
      }
    }
    return output;
  }
  if (isAbortSignalLike(value)) {
    const output: Record<string, JsonValue> = {
      type: "AbortSignal",
      aborted: value.aborted
    };
    const reason = normalizeValue(value.reason, seen);
    if (reason !== undefined) {
      output.reason = reason;
    }
    return output;
  }
  if (isBlobLike(value)) {
    return {
      type: value.constructor.name,
      size: value.size,
      mimeType: value.type
    };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      type: value.constructor.name,
      byteLength: value.byteLength
    };
  }
  if (value instanceof ArrayBuffer) {
    return {
      type: "ArrayBuffer",
      byteLength: value.byteLength
    };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return { type: "CircularReference" };
    }
    seen.add(value);
    return value.map((item) => normalizeValue(item, seen) ?? null);
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return { type: "CircularReference" };
    }
    seen.add(value);
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = normalizeValue((value as Record<string, unknown>)[key], seen);
      if (normalized !== undefined) {
        output[key] = normalized;
      }
    }
    return output;
  }
  return String(value);
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] ?? null)}`);
  return `{${entries.join(",")}}`;
}

function stableHash(input: string): string {
  return sha256(input);
}

function sha256(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push(Math.floor(bitLength / 2 ** shift) & 0xff);
  }

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const words = new Array<number>(64).fill(0);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] = (
        ((bytes[base] ?? 0) << 24) |
        ((bytes[base + 1] ?? 0) << 16) |
        ((bytes[base + 2] ?? 0) << 8) |
        (bytes[base + 3] ?? 0)
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      words[index] = (
        smallSigma1(words[index - 2] ?? 0) +
        (words[index - 7] ?? 0) +
        smallSigma0(words[index - 15] ?? 0) +
        (words[index - 16] ?? 0)
      ) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const temp1 = (
        (h ?? 0) +
        bigSigma1(e ?? 0) +
        choice(e ?? 0, f ?? 0, g ?? 0) +
        SHA256_ROUND_CONSTANTS[index]! +
        (words[index] ?? 0)
      ) >>> 0;
      const temp2 = (bigSigma0(a ?? 0) + majority(a ?? 0, b ?? 0, c ?? 0)) >>> 0;
      h = g;
      g = f;
      f = e;
      e = ((d ?? 0) + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + (a ?? 0)) >>> 0;
    hash[1] = ((hash[1] ?? 0) + (b ?? 0)) >>> 0;
    hash[2] = ((hash[2] ?? 0) + (c ?? 0)) >>> 0;
    hash[3] = ((hash[3] ?? 0) + (d ?? 0)) >>> 0;
    hash[4] = ((hash[4] ?? 0) + (e ?? 0)) >>> 0;
    hash[5] = ((hash[5] ?? 0) + (f ?? 0)) >>> 0;
    hash[6] = ((hash[6] ?? 0) + (g ?? 0)) >>> 0;
    hash[7] = ((hash[7] ?? 0) + (h ?? 0)) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (const char of input) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function bigSigma0(value: number): number {
  return rotateRight(value, 2) ^ rotateRight(value, 13) ^ rotateRight(value, 22);
}

function bigSigma1(value: number): number {
  return rotateRight(value, 6) ^ rotateRight(value, 11) ^ rotateRight(value, 25);
}

function smallSigma0(value: number): number {
  return rotateRight(value, 7) ^ rotateRight(value, 18) ^ (value >>> 3);
}

function smallSigma1(value: number): number {
  return rotateRight(value, 17) ^ rotateRight(value, 19) ^ (value >>> 10);
}

function choice(x: number, y: number, z: number): number {
  return (x & y) ^ (~x & z);
}

function majority(x: number, y: number, z: number): number {
  return (x & y) ^ (x & z) ^ (y & z);
}

function cloneEnvelope(envelope: DurableEventEnvelope): DurableEventEnvelope {
  return structuredClone(envelope);
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  path: string,
  issues: DurableEventValidationIssue[]
): void {
  if (typeof record[path] !== "string" || record[path].length === 0) {
    issues.push({ path, message: `${path} must be a non-empty string` });
  }
}

function requireNumber(
  record: Record<string, unknown>,
  path: string,
  issues: DurableEventValidationIssue[]
): void {
  if (typeof record[path] !== "number" || !Number.isFinite(record[path])) {
    issues.push({ path, message: `${path} must be a finite number` });
  }
}

function requireNonNegativeInteger(
  record: Record<string, unknown>,
  path: string,
  issues: DurableEventValidationIssue[]
): void {
  if (typeof record[path] !== "number" || !Number.isInteger(record[path]) || record[path] < 0) {
    issues.push({ path, message: `${path} must be a non-negative integer` });
  }
}

function requireRecordWithType(
  record: Record<string, unknown>,
  path: string,
  issues: DurableEventValidationIssue[]
): void {
  const value = record[path];
  if (!isRecord(value) || typeof value.type !== "string" || value.type.length === 0) {
    issues.push({ path, message: `${path} must include a type` });
  }
}

function isHashDescriptor(value: unknown): value is HashDescriptor {
  return isRecord(value) && value.algorithm === "sha256" && typeof value.value === "string" && value.value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortSignalLike(value: unknown): value is { aborted: boolean; reason?: unknown } {
  return isRecord(value) && typeof value.aborted === "boolean" && typeof value.addEventListener === "function";
}

function isBlobLike(value: unknown): value is { constructor: { name: string }; size: number; type: string } {
  return isRecord(value) && typeof value.size === "number" && typeof value.type === "string" && typeof value.arrayBuffer === "function";
}
