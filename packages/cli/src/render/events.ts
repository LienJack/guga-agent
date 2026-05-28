import type { HostEvent } from "@guga-agent/host-protocol";

export type RenderEventOptions = {
  debug?: boolean;
};

export function renderHostEvent(event: HostEvent, options: RenderEventOptions = {}): string[] {
  if (options.debug) {
    return [JSON.stringify(event)];
  }

  if (event.type === "message.delta") {
    return [event.text];
  }
  if (event.type === "tool.started") {
    return [`tool ${event.name} started`];
  }
  if (event.type === "tool.completed") {
    return [`tool ${event.name} completed`];
  }
  if (event.type === "tool.failed") {
    return [`tool ${event.name} failed: ${event.error.message}`];
  }
  if (event.type === "permission.requested") {
    return [`permission requested for ${event.toolName}`];
  }
  if (event.type === "interaction.requested") {
    return [`interaction requested: ${event.request.kind}`];
  }
  if (event.type === "interaction.resolved") {
    return [`interaction resolved: ${event.requestId}`];
  }
  if (event.type === "queue.updated") {
    return [`queued inputs: ${event.pending.length}`];
  }
  if (event.type === "run.failed") {
    return [`run failed: ${event.error.code} ${event.error.message}`];
  }
  return [];
}
