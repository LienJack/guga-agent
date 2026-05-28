import { describe, expect, it } from "vitest";
import { AgentEventType } from "@guga-agent/core";
import { artifactReferenceFixture, durableEvent, projectionFixture } from "./test-fixtures";
import { buildModelInputView } from "./model-input-view";

describe("model input replay view", () => {
  it("reconstructs committed provider input from recorded projection facts", () => {
    const projection = projectionFixture();
    const artifact = artifactReferenceFixture();
    const view = buildModelInputView([
      durableEvent({ type: AgentEventType.ContextProjectionCreated, runId: "run-1", turn: 0, projection }, { eventId: "event-1" }),
      durableEvent({
        type: AgentEventType.ProviderInputCommitted,
        runId: "run-1",
        turn: 0,
        projectionId: "projection-1",
        projectionHash: projection.hash,
        artifactIds: [artifact.artifactId]
      }, { eventId: "event-2", artifactRefs: [artifact] })
    ], { turn: 0 });

    expect(view.projection).toMatchObject({
      projectionId: "projection-1",
      messages: [{ role: "user", content: "hello" }],
      tools: [{
        name: "search",
        description: "Search the workspace",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
        effect: "read"
      }],
      sourceDescriptors: [expect.objectContaining({ id: "source-history" })],
      policyDecisions: [expect.objectContaining({ id: "decision-1" })],
      projectionHash: { value: "projection-hash-1" },
      artifactRefs: [expect.objectContaining({ artifactId: "artifact-large-output" })]
    });
  });

  it("does not use current tool registry state when replaying historical model input", () => {
    const projection = projectionFixture();
    projection.tools[0] = {
      name: "search",
      description: "Historical descriptor",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
      effect: "read"
    };

    const view = buildModelInputView([
      durableEvent({ type: AgentEventType.ContextProjectionCreated, runId: "run-1", turn: 0, projection }, { eventId: "event-1" }),
      durableEvent({
        type: AgentEventType.ProviderInputCommitted,
        runId: "run-1",
        turn: 0,
        projectionId: "projection-1"
      }, { eventId: "event-2" })
    ]);

    expect(view.projection?.tools).toEqual([
      expect.objectContaining({ name: "search", description: "Historical descriptor" })
    ]);
  });
});
