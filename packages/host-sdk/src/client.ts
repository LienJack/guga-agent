import type {
  CapabilityResource,
  HostEvent,
  HostProtocolInfoResource,
  AuditSummaryResource,
  InteractionRequest,
  InteractionResource,
  MetricsSnapshotResource,
  OperationalStatusResource,
  PermissionRequestResource,
  PermissionResolution,
  ProviderHealthResource,
  RunInputMode,
  RunResource,
  SessionResource,
  SessionTreeResource
} from "@guga-agent/host-protocol";
import { streamHostEvents } from "./sse-client";

export type HostClientFetch = typeof fetch;

export type ConnectHostOptions = {
  baseUrl: string;
  fetch?: HostClientFetch;
  bridgeToken?: string;
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

export type SendRunInputRequest = {
  mode: RunInputMode;
  text: string;
};

export type ForkSessionRequest = {
  parentBranchId?: string;
  createdFromRunId?: string;
  summary?: string;
};

export type RequestInteractionRequest = {
  runId?: string;
  request: InteractionRequest;
};

export type HostClient = {
  getProtocolInfo(): Promise<HostProtocolInfoResource>;
  assertCompatibleProtocol(): Promise<HostProtocolInfoResource>;
  createSession(request?: CreateSessionRequest): Promise<SessionResource>;
  listSessions(): Promise<SessionResource[]>;
  getSession(sessionId: string): Promise<SessionResource>;
  resumeSession(sessionId: string, request?: { branchId?: string }): Promise<SessionResource>;
  forkSession(sessionId: string, request?: ForkSessionRequest): Promise<SessionResource>;
  getSessionTree(sessionId: string): Promise<SessionTreeResource>;
  startRun(sessionId: string, request: StartRunRequest): Promise<RunResource>;
  getRun(runId: string): Promise<RunResource>;
  listRunEvents(runId: string): Promise<HostEvent[]>;
  streamRunEvents(runId: string, options?: { afterSeq?: number; signal?: AbortSignal }): AsyncIterable<HostEvent>;
  sendRunInput(runId: string, request: SendRunInputRequest): Promise<RunResource>;
  cancelRun(runId: string): Promise<RunResource>;
  abortRun(runId: string): Promise<RunResource>;
  requestInteraction(sessionId: string, request: RequestInteractionRequest): Promise<InteractionResource>;
  getInteraction(interactionId: string): Promise<InteractionResource>;
  respondInteraction(interactionId: string, response: unknown): Promise<InteractionResource>;
  getPermission(permissionId: string): Promise<PermissionRequestResource>;
  respondPermission(permissionId: string, resolution: PermissionResolution): Promise<PermissionRequestResource>;
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
  const bridgeToken = options.bridgeToken;

  return {
    getProtocolInfo() {
      return requestJson(fetchImpl, `${baseUrl}/protocol`, { bridgeToken });
    },
    async assertCompatibleProtocol() {
      const info = await requestJson<HostProtocolInfoResource>(fetchImpl, `${baseUrl}/protocol`, { bridgeToken });
      if (info.version !== "1") {
        throw new HostClientError(`Unsupported host protocol version: ${info.version}`, {
          status: 426,
          code: "UNSUPPORTED_PROTOCOL_VERSION",
          details: info
        });
      }
      return info;
    },
    createSession(request = {}) {
      return requestJson(fetchImpl, `${baseUrl}/sessions`, {
        bridgeToken,
        method: "POST",
        body: request
      });
    },
    async listSessions() {
      const response = await requestJson<{ sessions: SessionResource[] }>(fetchImpl, `${baseUrl}/sessions`, { bridgeToken });
      return response.sessions;
    },
    getSession(sessionId) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}`, { bridgeToken });
    },
    resumeSession(sessionId, request = {}) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/resume`, {
        bridgeToken,
        method: "POST",
        body: request
      });
    },
    forkSession(sessionId, request = {}) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/fork`, {
        bridgeToken,
        method: "POST",
        body: request
      });
    },
    getSessionTree(sessionId) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/tree`, { bridgeToken });
    },
    startRun(sessionId, request) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/runs`, {
        bridgeToken,
        method: "POST",
        body: request
      });
    },
    getRun(runId) {
      return requestJson(fetchImpl, `${baseUrl}/runs/${encodeURIComponent(runId)}`, { bridgeToken });
    },
    async listRunEvents(runId) {
      const response = await requestJson<{ events: HostEvent[] }>(
        fetchImpl,
        `${baseUrl}/runs/${encodeURIComponent(runId)}/events`,
        { bridgeToken }
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
        ...(bridgeToken ? { bridgeToken } : {}),
        ...(streamOptions.signal ? { signal: streamOptions.signal } : {})
      });
    },
    sendRunInput(runId, request) {
      return requestJson(fetchImpl, `${baseUrl}/runs/${encodeURIComponent(runId)}/input`, {
        bridgeToken,
        method: "POST",
        body: request
      });
    },
    cancelRun(runId) {
      return requestJson(fetchImpl, `${baseUrl}/runs/${encodeURIComponent(runId)}/cancel`, {
        bridgeToken,
        method: "POST",
        body: {}
      });
    },
    abortRun(runId) {
      return requestJson(fetchImpl, `${baseUrl}/runs/${encodeURIComponent(runId)}/abort`, {
        bridgeToken,
        method: "POST",
        body: {}
      });
    },
    requestInteraction(sessionId, request) {
      return requestJson(fetchImpl, `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/interactions`, {
        bridgeToken,
        method: "POST",
        body: request
      });
    },
    getInteraction(interactionId) {
      return requestJson(fetchImpl, `${baseUrl}/interactions/${encodeURIComponent(interactionId)}`, { bridgeToken });
    },
    respondInteraction(interactionId, response) {
      return requestJson(fetchImpl, `${baseUrl}/interactions/${encodeURIComponent(interactionId)}/respond`, {
        bridgeToken,
        method: "POST",
        body: { response }
      });
    },
    getPermission(permissionId) {
      return requestJson(fetchImpl, `${baseUrl}/permissions/${encodeURIComponent(permissionId)}`, { bridgeToken });
    },
    respondPermission(permissionId, resolution) {
      return requestJson(fetchImpl, `${baseUrl}/permissions/${encodeURIComponent(permissionId)}/respond`, {
        bridgeToken,
        method: "POST",
        body: resolution
      });
    },
    async listCapabilities() {
      const response = await requestJson<{ capabilities: CapabilityResource[] }>(fetchImpl, `${baseUrl}/capabilities`, { bridgeToken });
      return response.capabilities;
    },
    async listProviderHealth() {
      const response = await requestJson<{ health: ProviderHealthResource[] }>(
        fetchImpl,
        `${baseUrl}/operations/health`,
        { bridgeToken }
      );
      return response.health;
    },
    async listAuditSummaries() {
      const response = await requestJson<{ summaries: AuditSummaryResource[] }>(
        fetchImpl,
        `${baseUrl}/operations/audit`,
        { bridgeToken }
      );
      return response.summaries;
    },
    getMetricsSnapshot() {
      return requestJson(fetchImpl, `${baseUrl}/operations/metrics`, { bridgeToken });
    },
    getOperationalStatus() {
      return requestJson(fetchImpl, `${baseUrl}/operations/status`, { bridgeToken });
    }
  };
}

async function requestJson<ResponseBody>(
  fetchImpl: HostClientFetch,
  url: string,
  options: { method?: string; body?: unknown; bridgeToken?: string | undefined } = {}
): Promise<ResponseBody> {
  const response = await fetchImpl(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.bridgeToken ? { authorization: `Bearer ${options.bridgeToken}` } : {}),
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
