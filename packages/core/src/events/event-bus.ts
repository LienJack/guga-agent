import type { AgentEvent } from "../contracts/events";

export type EventListener = (event: AgentEvent) => void;

export class EventBus {
  readonly events: AgentEvent[] = [];
  private readonly listeners = new Set<EventListener>();

  publish(event: AgentEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.events.length = 0;
  }

  dispose(): void {
    this.clear();
    this.listeners.clear();
  }
}
