import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import type { DurableEventEnvelope, EventStore } from "../contracts/persistence";
import { EventBus } from "./event-bus";

describe("EventBus", () => {
  it("publishes events to subscribers and records them in order", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.subscribe((event) => seen.push(event.type));

    bus.publish({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" });
    bus.publish({ type: AgentEventType.RunFinished, runId: "run-1", status: "completed" });

    expect(seen).toEqual([AgentEventType.RunStarted, AgentEventType.RunFinished]);
    expect(bus.events.map((event) => event.type)).toEqual([
      AgentEventType.RunStarted,
      AgentEventType.RunFinished
    ]);
  });

  it("stops notifying unsubscribed listeners", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe((event) => seen.push(event.type));

    unsubscribe();
    bus.publish({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" });

    expect(seen).toEqual([]);
    expect(bus.events).toHaveLength(1);
  });

  it("keeps legacy publish synchronous and independent from durable-store failures", () => {
    const appendCalls: DurableEventEnvelope[] = [];
    const bus = new EventBus({
      durableContext: () => ({
        eventStore: {
          append(event) {
            appendCalls.push(event);
            return { ok: false, status: "unavailable", reason: "disk full" };
          },
          readStream() {
            return { ok: true, events: [], nextRevision: 0 };
          }
        },
        session: { sessionId: "session-1", branchId: "main" }
      })
    });
    const seen: string[] = [];
    bus.subscribe((event) => seen.push(event.type));

    bus.publish({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" });

    expect(seen).toEqual([AgentEventType.RunStarted]);
    expect(bus.events).toHaveLength(1);
    expect(appendCalls).toEqual([]);
  });

  it("appends durable records before publishing through the durable channel", async () => {
    const durableEvents: DurableEventEnvelope[] = [];
    const order: string[] = [];
    const eventStore: EventStore = {
      append(event) {
        order.push(`append:${event.payload.type}`);
        durableEvents.push(event);
        return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
      },
      readStream() {
        return { ok: true, events: durableEvents, nextRevision: durableEvents.length };
      }
    };
    const bus = new EventBus({
      durableContext: () => ({
        eventStore,
        session: { sessionId: "session-1", branchId: "main" }
      })
    });
    bus.subscribe((event) => order.push(`publish:${event.type}`));

    const result = await bus.publishDurable({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" });

    expect(result).toMatchObject({ ok: true, status: "appended" });
    expect(order).toEqual(["append:run.started", "publish:run.started"]);
    expect(bus.events.map((event) => event.type)).toEqual([AgentEventType.RunStarted]);
    expect(durableEvents[0]).toMatchObject({
      streamId: "session/session-1",
      streamRevision: 0,
      sessionId: "session-1",
      branchId: "main"
    });
  });

  it("does not publish durable-channel events when append fails", async () => {
    const bus = new EventBus({
      durableContext: () => ({
        eventStore: {
          append() {
            return { ok: false, status: "unavailable", reason: "store offline" };
          },
          readStream() {
            return { ok: true, events: [], nextRevision: 0 };
          }
        },
        session: { sessionId: "session-1", branchId: "main" }
      })
    });

    const result = await bus.publishDurable({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" });

    expect(result).toMatchObject({ ok: false, message: "store offline" });
    expect(bus.events).toEqual([]);
  });
});
