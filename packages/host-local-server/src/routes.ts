import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostRuntime, StartRunOptions } from "@guga-agent/host-runtime";
import type { PermissionResolution } from "@guga-agent/host-protocol";
import { streamRunEvents } from "./sse";

export type HostRequestHandlerOptions = {
  pollIntervalMs?: number;
  bridgeToken?: string;
};

export function createHostRequestHandler(
  hostRuntime: HostRuntime,
  options: HostRequestHandlerOptions = {}
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleRequest(hostRuntime, request, response, options);
  };
}

async function handleRequest(
  hostRuntime: HostRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  options: HostRequestHandlerOptions
): Promise<void> {
  try {
    if (request.method === "OPTIONS") {
      if (!isTrustedOrigin(request.headers.origin)) {
        sendError(response, 403, "FORBIDDEN_ORIGIN", "Origin is not allowed");
        return;
      }
      response.writeHead(204, corsHeaders(request));
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (!isTrustedOrigin(request.headers.origin)) {
      sendError(response, 403, "FORBIDDEN_ORIGIN", "Origin is not allowed");
      return;
    }
    if (request.method !== "GET" && !hasBridgeToken(request, options.bridgeToken)) {
      sendError(response, 401, "UNAUTHORIZED", "Host bridge token is required");
      return;
    }

    if (request.method === "GET" && segments.length === 1 && segments[0] === "protocol") {
      sendJson(response, 200, hostRuntime.getProtocolInfo());
      return;
    }

    if (request.method === "POST" && segments.length === 1 && segments[0] === "sessions") {
      const body = await readJsonBody<{ title?: unknown }>(request);
      sendJson(response, 201, await hostRuntime.createSession({
        ...(typeof body.title === "string" ? { title: body.title } : {})
      }));
      return;
    }

    if (request.method === "GET" && segments.length === 1 && segments[0] === "sessions") {
      sendJson(response, 200, { sessions: await hostRuntime.listSessions() });
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "sessions") {
      const session = await hostRuntime.getSession(segments[1] ?? "");
      sendJsonOrNotFound(response, session, "Session not found");
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "resume") {
      const body = await readJsonBody<{ branchId?: unknown }>(request);
      const session = await hostRuntime.resumeSession(segments[1] ?? "", {
        ...(typeof body.branchId === "string" ? { branchId: body.branchId } : {})
      });
      sendJsonOrNotFound(response, session, "Session or branch not found");
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "fork") {
      const body = await readJsonBody<{
        parentBranchId?: unknown;
        createdFromRunId?: unknown;
        summary?: unknown;
      }>(request);
      const session = hostRuntime.forkSession(segments[1] ?? "", {
        ...(typeof body.parentBranchId === "string" ? { parentBranchId: body.parentBranchId } : {}),
        ...(typeof body.createdFromRunId === "string" ? { createdFromRunId: body.createdFromRunId } : {}),
        ...(typeof body.summary === "string" ? { summary: body.summary } : {})
      });
      sendJsonOrNotFound(response, session, "Session or branch not found");
      return;
    }

    if (request.method === "GET" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "tree") {
      sendJsonOrNotFound(response, hostRuntime.getSessionTree(segments[1] ?? ""), "Session not found");
      return;
    }

    if (request.method === "GET" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "tasks") {
      const sessionId = segments[1] ?? "";
      if (!await hostRuntime.getSession(sessionId)) {
        sendError(response, 404, "NOT_FOUND", "Session not found");
        return;
      }
      sendJson(response, 200, { tasks: hostRuntime.listSessionTasks(sessionId) });
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "interactions") {
      const sessionId = segments[1] ?? "";
      const body = await readJsonBody<{ runId?: unknown; request?: unknown }>(request);
      if (!isInteractionRequest(body.request)) {
        sendError(response, 400, "BAD_REQUEST", "Interaction request is invalid");
        return;
      }
      const interaction = hostRuntime.requestInteraction({
        sessionId,
        ...(typeof body.runId === "string" ? { runId: body.runId } : {}),
        request: body.request
      });
      sendJsonOrNotFound(response, interaction, "Session or run not found");
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "runs") {
      const sessionId = segments[1] ?? "";
      if (!await hostRuntime.getSession(sessionId)) {
        sendError(response, 404, "NOT_FOUND", "Session not found");
        return;
      }
      const body = await readJsonBody<{
        input?: unknown;
        providerId?: unknown;
        modelId?: unknown;
        maxTurns?: unknown;
      }>(request);
      if (typeof body.input !== "string" || body.input.length === 0) {
        sendError(response, 400, "BAD_REQUEST", "Run input is required");
        return;
      }
      const runOptions: StartRunOptions = {
        sessionId,
        input: body.input,
        ...(typeof body.providerId === "string" ? { providerId: body.providerId } : {}),
        ...(typeof body.modelId === "string" ? { modelId: body.modelId } : {}),
        ...(typeof body.maxTurns === "number" ? { maxTurns: body.maxTurns } : {})
      };
      const run = hostRuntime.startRunDetached(runOptions);
      sendJson(response, 201, run);
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "runs") {
      sendJsonOrNotFound(response, hostRuntime.getRun(segments[1] ?? ""), "Run not found");
      return;
    }

    if (request.method === "GET" && segments.length === 3 && segments[0] === "runs" && segments[2] === "events") {
      const runId = segments[1] ?? "";
      if (!hostRuntime.getRun(runId)) {
        sendError(response, 404, "NOT_FOUND", "Run not found");
        return;
      }
      const wantsSse = request.headers.accept?.includes("text/event-stream") || url.searchParams.get("stream") === "true";
      if (wantsSse) {
        await streamRunEvents({
          hostRuntime,
          runId,
          request,
          response,
          afterSeq: Number(url.searchParams.get("afterSeq") ?? "0"),
          ...(options.pollIntervalMs !== undefined ? { pollIntervalMs: options.pollIntervalMs } : {})
        });
        return;
      }
      sendJson(response, 200, { events: hostRuntime.listRunEvents(runId) });
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "runs" && segments[2] === "cancel") {
      const run = hostRuntime.cancelRun(segments[1] ?? "");
      sendJsonOrNotFound(response, run, "Run not found");
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "runs" && segments[2] === "abort") {
      const run = hostRuntime.cancelRun(segments[1] ?? "");
      sendJsonOrNotFound(response, run, "Run not found");
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "runs" && segments[2] === "input") {
      const runId = segments[1] ?? "";
      const run = hostRuntime.getRun(runId);
      if (!run) {
        sendError(response, 404, "NOT_FOUND", "Run not found");
        return;
      }
      if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
        sendError(response, 409, "RUN_NOT_ACTIVE", "Run input can only be queued while a run is active");
        return;
      }
      const body = await readJsonBody<{ mode?: unknown; text?: unknown }>(request);
      const mode = body.mode === "follow_up" ? "follow_up" : body.mode === "steer" ? "steer" : undefined;
      if (!mode || typeof body.text !== "string" || body.text.trim().length === 0) {
        sendError(response, 400, "BAD_REQUEST", "Run input requires mode steer|follow_up and non-empty text");
        return;
      }
      const updatedRun = hostRuntime.enqueueRunInput(runId, { mode, text: body.text });
      if (!updatedRun) {
        sendError(response, 409, "RUN_NOT_ACTIVE", "Run input can only be queued while a run is active");
        return;
      }
      sendJson(response, 202, updatedRun);
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "permissions") {
      sendJsonOrNotFound(response, hostRuntime.getPermission(segments[1] ?? ""), "Permission request not found");
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "tasks") {
      sendJsonOrNotFound(response, hostRuntime.getTask(segments[1] ?? ""), "Task not found");
      return;
    }

    if (request.method === "GET" && segments.length === 3 && segments[0] === "tasks" && segments[2] === "verifications") {
      const task = hostRuntime.getTask(segments[1] ?? "");
      if (!task) {
        sendError(response, 404, "NOT_FOUND", "Task not found");
        return;
      }
      sendJson(response, 200, { attempts: task.verificationAttempts });
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "permissions" && segments[2] === "respond") {
      const body = await readJsonBody<{
        decision?: unknown;
        remember?: unknown;
        reason?: unknown;
        updatedInput?: unknown;
      }>(request);
      const resolution = parsePermissionResolutionBody(body);
      if (!resolution.ok) {
        sendError(response, 400, "BAD_REQUEST", resolution.message);
        return;
      }
      const result = hostRuntime.respondPermission(segments[1] ?? "", resolution.value);
      if (!result.ok) {
        sendError(response, result.status, result.error.code, result.error.message);
        return;
      }
      sendJson(response, 200, result.permission);
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "interactions") {
      sendJsonOrNotFound(response, hostRuntime.getInteraction(segments[1] ?? ""), "Interaction not found");
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "interactions" && segments[2] === "respond") {
      const body = await readJsonBody<{ response?: unknown }>(request);
      sendJsonOrNotFound(
        response,
        hostRuntime.resolveInteraction(segments[1] ?? "", body.response),
        "Interaction not found"
      );
      return;
    }

    if (request.method === "GET" && segments.length === 1 && segments[0] === "capabilities") {
      sendJson(response, 200, { capabilities: hostRuntime.listCapabilities() });
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "operations" && segments[1] === "health") {
      sendJson(response, 200, { health: hostRuntime.listProviderHealth() });
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "operations" && segments[1] === "audit") {
      sendJson(response, 200, { summaries: hostRuntime.listAuditSummaries() });
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "operations" && segments[1] === "metrics") {
      sendJson(response, 200, hostRuntime.getMetricsSnapshot());
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "operations" && segments[1] === "status") {
      sendJson(response, 200, hostRuntime.getOperationalStatus());
      return;
    }

    sendError(response, 404, "NOT_FOUND", "Route not found");
  } catch (error) {
    sendError(response, 500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Unexpected error");
  }
}

function isInteractionRequest(value: unknown): value is Parameters<HostRuntime["requestInteraction"]>[0]["request"] {
  if (!value || typeof value !== "object" || !("kind" in value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case "select":
      return "options" in value && Array.isArray(value.options);
    case "confirm":
      return "message" in value && typeof value.message === "string";
    case "input":
    case "editor":
      return true;
    case "notify":
      return "level" in value && ["info", "warning", "error"].includes(String(value.level)) && "message" in value && typeof value.message === "string";
    case "setStatus":
      return "text" in value && typeof value.text === "string";
    case "setWidget":
      return "widgetId" in value && typeof value.widgetId === "string" && "payload" in value;
    case "setTitle":
      return "title" in value && typeof value.title === "string";
    case "set_editor_text":
      return "text" in value && typeof value.text === "string";
    default:
      return false;
  }
}

async function readJsonBody<Body>(request: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as Body;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
}

function sendJsonOrNotFound(response: ServerResponse, value: unknown, message: string): void {
  if (!value) {
    sendError(response, 404, "NOT_FOUND", message);
    return;
  }
  sendJson(response, 200, value);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, statusCode: number, code: string, message: string): void {
  sendJson(response, statusCode, { error: { code, message } });
}

function corsHeaders(request?: IncomingMessage): Record<string, string> {
  const origin = trustedOriginHeader(request?.headers.origin);
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,accept,authorization",
    "vary": "Origin"
  };
}

function hasBridgeToken(request: IncomingMessage, bridgeToken: string | undefined): boolean {
  if (!bridgeToken) {
    return false;
  }
  return request.headers.authorization === `Bearer ${bridgeToken}`;
}

function isTrustedOrigin(origin: string | undefined): boolean {
  return origin === undefined || trustedOriginHeader(origin) !== undefined;
}

function trustedOriginHeader(origin: string | undefined): string | undefined {
  if (!origin) {
    return undefined;
  }
  try {
    const parsed = new URL(origin);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:")
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1")
    ) {
      return origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parsePermissionResolutionBody(
  body: {
    decision?: unknown;
    remember?: unknown;
    reason?: unknown;
    updatedInput?: unknown;
  }
): { ok: true; value: PermissionResolution } | { ok: false; message: string } {
  if (body.decision !== "allow" && body.decision !== "deny") {
    return { ok: false, message: "Permission resolution requires decision allow|deny" };
  }
  if (
    body.remember !== undefined
    && body.remember !== "once"
    && body.remember !== "session"
    && body.remember !== "always"
  ) {
    return { ok: false, message: "Permission resolution remember must be once|session|always" };
  }
  if (body.reason !== undefined && typeof body.reason !== "string") {
    return { ok: false, message: "Permission resolution reason must be a string" };
  }
  return {
    ok: true,
    value: {
      decision: body.decision,
      ...(body.remember !== undefined ? { remember: body.remember } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      ...(body.updatedInput !== undefined ? { updatedInput: body.updatedInput } : {})
    }
  };
}
