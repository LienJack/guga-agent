import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority } from "../contracts/context";
import { ModelInputProjector } from "./model-input-projection";
import { buildStateProjectionSource } from "./state-projection";

describe("buildStateProjectionSource", () => {
  it("projects objective and evidence references without storing raw fact content in safe metadata", () => {
    const projection = new ModelInputProjector({ idFactory: () => "base" }).assemble({
      runId: "run-state",
      turn: 0,
      messages: [
        { role: "user", content: "Finish M4. You must preserve tool refs." },
        { role: "tool", toolCallId: "call-1", name: "read_file", content: "README preview", isError: false }
      ],
      tools: []
    });

    const source = buildStateProjectionSource(projection);

    expect(source).toMatchObject({
      id: "state-projection-base",
      kind: ContextSourceKind.StateProjection,
      priority: ContextSourcePriority.High,
      modelVisible: false
    });
    expect(source?.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "message", id: "message-0" }),
      expect.objectContaining({ type: "tool-result", id: "call-1" })
    ]));
    expect(source?.metadata).toMatchObject({
      ontology: ContextSourceKind.StateProjection,
      items: expect.arrayContaining([
        expect.objectContaining({ kind: "objective", label: "initial user objective" }),
        expect.objectContaining({ kind: "constraint", label: "explicit user constraint" }),
        expect.objectContaining({ kind: "key_fact", label: "referenced evidence" })
      ])
    });
    expect(JSON.stringify(source?.metadata)).not.toContain("README preview");
    expect(JSON.stringify(source?.metadata)).not.toContain("Finish M4");
  });

  it("keeps tool-only projections minimal without inventing a goal", () => {
    const projection = new ModelInputProjector({ idFactory: () => "tool-only" }).assemble({
      runId: "run-state",
      turn: 1,
      messages: [
        { role: "tool", toolCallId: "call-1", name: "search", content: "preview", isError: false }
      ],
      tools: []
    });

    const source = buildStateProjectionSource(projection);

    expect(source?.metadata).toMatchObject({
      items: [expect.objectContaining({ kind: "key_fact" })]
    });
    expect(JSON.stringify(source?.metadata)).not.toContain("objective");
  });

  it("passes through projection budgeting and hashing as an additional source", () => {
    const projector = new ModelInputProjector({ idFactory: () => "base" });
    const base = projector.assemble({
      runId: "run-state",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: []
    });
    const state = buildStateProjectionSource(base);
    const projection = new ModelInputProjector({ idFactory: () => "with-state" }).assemble({
      runId: "run-state",
      turn: 0,
      messages: base.messages,
      tools: [],
      additionalSources: state ? [state] : []
    });

    expect(projection.sourceDescriptors).toContainEqual(expect.objectContaining({ kind: ContextSourceKind.StateProjection }));
    expect(projection.hash?.value).toBeTruthy();
  });

  it("returns no descriptor for an empty projection", () => {
    const projection = new ModelInputProjector({ idFactory: () => "empty" }).assemble({
      runId: "run-state",
      turn: 0,
      messages: [],
      tools: []
    });

    expect(buildStateProjectionSource(projection)).toBeUndefined();
  });
});
