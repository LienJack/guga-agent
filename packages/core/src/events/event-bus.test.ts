import { describe, expect, it } from "vitest";
import { EventBus } from "./event-bus";

describe("EventBus", () => {
  it("publishes events to subscribers and records them in order", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.subscribe((event) => seen.push(event.type));

    bus.publish({ type: "run.started", runId: "run-1", input: "hello" });
    bus.publish({ type: "run.finished", runId: "run-1", status: "completed" });

    expect(seen).toEqual(["run.started", "run.finished"]);
    expect(bus.events.map((event) => event.type)).toEqual(["run.started", "run.finished"]);
  });

  it("stops notifying unsubscribed listeners", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe((event) => seen.push(event.type));

    unsubscribe();
    bus.publish({ type: "run.started", runId: "run-1", input: "hello" });

    expect(seen).toEqual([]);
    expect(bus.events).toHaveLength(1);
  });
});
