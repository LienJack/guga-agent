import type {
  CapabilityResource,
  HostEvent,
  AuditSummaryResource,
  MetricsSnapshotResource,
  OperationalStatusResource,
  ProviderHealthResource,
  RunResource,
  SessionResource
} from "@guga-agent/host-protocol";
import { streamHostEvents } from "./sse-client";

export type HostClientFetch = typeof fetch;

export type ConnectHostOptions = {
  baseUrl: string;
  fetch?: HostClientFetch;
};

export type CreateSessionRequest = {
  title?: string;
};

export type StartRunRequest = {
  input: string;
  providerId?: string;
  modelId?: string;
  maxTurns?: number;
};

export type HostClient = {
  createSession(request?: CreateSessionRequest): Promise<SessionResource>;
  getSession(sessionId: string): Promise<SessionResource>;
  startRun(sessionId: string, request: StartRunRequest): Promise<RunResource>;
  getRun(runId: string): Promise<RunResource>;
  listRunEvents(runId: string): Promise<HostEvent[]>;
  streamRunEvents(runId: string, options?: { afterSeq?: number; signal?: AbortSignal }): AsyncIterable<HostEvent>;
  cancelRun(runId: string): Promise<RunResource>;
  listCapabilities(): Promise<CapabilityResource[]>;
  listProviderHealth(): Promise<ProviderHealthResource[]>;
  listAuditSummaries(): Promise<AuditSummaryResource[]>;
  getMetricsSnapshot(): Promise<MetricsSnapshotResource>;
  getOperationalStatus(): Promise<OperationalStatusResource>;
};

export class HostClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, options: { status: number; code: string; details?: unknown }) {
    super(message);
    this.name = "HostClientError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export function connectHost(options: ConnectHostOptions): HostClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? fetch;

  return {
    createSession(request = {}) {
      return requestJson(fetchImpl, `${baseUrl}/sessions`, {
        method: "POST",
        body: request
      });
    },
    getSession(sessionId) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}`);
    },
    startRun(sessionId, request) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/runs`, {
        method: "POST",
        body: request
      });
    },
    getRun(runId) {
      return requestJson(fetchImpl, `${baseUrl}/runs/${encodeURIComponent(runId)}`);
    },
    async listRunEvents(runId) {
      const response = await requestJson<{ events: HostEvent[] }>(
        fetchImpl,
        `${baseUrl}/runs/${encodeURIComponent(runId)}/events`
      );
      return response.events;
    },
    streamRunEvents(runId, streamOptions = {}) {
      const url = new URL(`${baseUrl}/runs/${encodeURIComponent(runId)}/events`);
      if (streamOptions.afterSeq !== undefined) {
        url.searchParams.set("afterSeq", String(streamOptions.afterSeq));
      }
      return streamHostEvents({
        url: url.toString(),
        fetch: fetchImpl,
        ...(streamOptions.signal ? { signal: streamOptions.signal } : {})
      });
    },
    cancelRun(runId) {
      return requestJson(fetchImpl, `${baseUrl}/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        body: {}
      });
    },
    async listCapabilities() {
      const response = await requestJson<{ capabilities: CapabilityResource[] }>(fetchImpl, `${baseUrl}/capabilities`);
      return response.capabilities;
    },
    async listProviderHealth() {
      const response = await requestJson<{ health: ProviderHealthResource[] }>(
        fetchImpl,
        `${baseUrl}/operations/health`
      );
      return response.health;
    },
    async listAuditSummaries() {
      const response = await requestJson<{ summaries: AuditSummaryResource[] }>(
        fetchImpl,
        `${baseUrl}/operations/audit`
      );
      return response.summaries;
    },
    getMetricsSnapshot() {
      return requestJson(fetchImpl, `${baseUrl}/operations/metrics`);
    },
    getOperationalStatus() {
      return requestJson(fetchImpl, `${baseUrl}/operations/status`);
    }
  };
}

async function requestJson<ResponseBody>(
  fetchImpl: HostClientFetch,
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<ResponseBody> {
  const response = await fetchImpl(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const json = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    const error = errorPayload(json);
    throw new HostClientError(error.message, {
      status: response.status,
      code: error.code,
      details: json
    });
  }
  return json as ResponseBody;
}

function errorPayload(value: unknown): { code: string; message: string } {
  if (
    value
    && typeof value === "object"
    && "error" in value
    && value.error
    && typeof value.error === "object"
    && "code" in value.error
    && "message" in value.error
  ) {
    return {
      code: String(value.error.code),
      message: String(value.error.message)
    };
  }
  return {
    code: "HOST_REQUEST_FAILED",
    message: "Host request failed"
  };
}
