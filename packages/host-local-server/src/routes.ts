import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostRuntime, StartRunOptions } from "@guga-agent/host-runtime";
import { streamRunEvents } from "./sse";

export type HostRequestHandlerOptions = {
  pollIntervalMs?: number;
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
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (request.method === "POST" && segments.length === 1 && segments[0] === "sessions") {
      const body = await readJsonBody<{ title?: unknown }>(request);
      sendJson(response, 201, hostRuntime.createSession({
        ...(typeof body.title === "string" ? { title: body.title } : {})
      }));
      return;
    }

    if (request.method === "GET" && segments.length === 2 && segments[0] === "sessions") {
      const session = hostRuntime.getSession(segments[1] ?? "");
      sendJsonOrNotFound(response, session, "Session not found");
      return;
    }

    if (request.method === "POST" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "runs") {
      const sessionId = segments[1] ?? "";
      if (!hostRuntime.getSession(sessionId)) {
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
      const run = await hostRuntime.startRun(runOptions);
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

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,accept"
  };
}
