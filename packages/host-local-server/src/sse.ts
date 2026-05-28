import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createSseEnvelope,
  encodeSseEnvelope,
  isTerminalHostEvent,
  type HostEvent,
  type RunResource
} from "@guga-agent/host-protocol";

export type StreamRunEventsOptions = {
  hostRuntime: {
    getRun(runId: string): RunResource | undefined;
    listRunEvents(runId: string): HostEvent[];
  };
  runId: string;
  request: IncomingMessage;
  response: ServerResponse;
  afterSeq?: number;
  pollIntervalMs?: number;
};

export async function streamRunEvents(options: StreamRunEventsOptions): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 25;
  let lastSeq = Number.isFinite(options.afterSeq) ? options.afterSeq ?? 0 : 0;
  let closed = false;
  let interval: NodeJS.Timeout | undefined;

  options.response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "access-control-allow-origin": "*"
  });

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (interval) {
        clearInterval(interval);
      }
      resolve();
    };

    const finish = () => {
      if (!options.response.destroyed && !options.response.writableEnded) {
        options.response.end();
      }
      cleanup();
    };

    const flush = () => {
      if (closed) {
        return;
      }
      const events = options.hostRuntime
        .listRunEvents(options.runId)
        .filter((event) => event.seq > lastSeq)
        .sort((left, right) => left.seq - right.seq);
      for (const event of events) {
        options.response.write(encodeSseEnvelope(createSseEnvelope(event)));
        lastSeq = event.seq;
        if (isTerminalHostEvent(event)) {
          finish();
          return;
        }
      }
      const run = options.hostRuntime.getRun(options.runId);
      if (run && (run.status === "completed" || run.status === "failed" || run.status === "cancelled")) {
        finish();
      }
    };

    options.request.on("close", cleanup);
    flush();
    if (!closed) {
      interval = setInterval(flush, pollIntervalMs);
    }
  });
}
