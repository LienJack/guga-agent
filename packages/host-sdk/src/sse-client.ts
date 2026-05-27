import type { HostEvent, SseEnvelope } from "@guga-agent/host-protocol";
import { HOST_EVENT_SSE_NAME } from "@guga-agent/host-protocol";
import type { HostClientFetch } from "./client";

export type StreamHostEventsOptions = {
  url: string;
  fetch?: HostClientFetch;
  signal?: AbortSignal;
};

export async function* streamHostEvents(options: StreamHostEventsOptions): AsyncIterable<HostEvent> {
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(options.url, {
    headers: { accept: "text/event-stream" },
    ...(options.signal ? { signal: options.signal } : {})
  });
  if (!response.ok) {
    throw new Error(`Unable to open host event stream: HTTP ${response.status}`);
  }
  if (!response.body) {
    for (const envelope of parseSsePayload(await response.text())) {
      yield envelope.data;
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = splitCompleteFrames(buffer);
      buffer = frames.remainder;
      for (const frame of frames.frames) {
        const envelope = parseSseFrame(frame);
        if (envelope) {
          yield envelope.data;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const envelope = parseSseFrame(buffer);
      if (envelope) {
        yield envelope.data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseSsePayload(payload: string): SseEnvelope[] {
  return payload
    .split(/\r?\n\r?\n/)
    .map(parseSseFrame)
    .filter((envelope): envelope is SseEnvelope => !!envelope);
}

function splitCompleteFrames(buffer: string): { frames: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  return {
    frames: parts.slice(0, -1),
    remainder: parts.at(-1) ?? ""
  };
}

function parseSseFrame(frame: string): SseEnvelope | undefined {
  const lines = frame.split(/\r?\n/);
  let id = "";
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("id:")) {
      id = line.slice("id:".length).trimStart();
    } else if (line.startsWith("event:")) {
      event = line.slice("event:".length).trimStart();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (event !== HOST_EVENT_SSE_NAME || dataLines.length === 0) {
    return undefined;
  }
  const data = JSON.parse(dataLines.join("\n")) as HostEvent;
  return { id, event, data };
}
