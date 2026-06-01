import { hostEventSseName, type HostEvent } from "./events";

export type SseEnvelope<Event extends HostEvent = HostEvent> = {
  id: string;
  event: string;
  data: Event;
};

export function createSseEnvelope<Event extends HostEvent>(event: Event): SseEnvelope<Event> {
  return {
    id: String(event.seq),
    event: hostEventSseName(event),
    data: event
  };
}

export function encodeSseEnvelope(envelope: SseEnvelope): string {
  return [
    `id: ${envelope.id}`,
    `event: ${envelope.event}`,
    `data: ${JSON.stringify(envelope.data)}`,
    ""
  ].join("\n") + "\n";
}
