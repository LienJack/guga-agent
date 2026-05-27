import { describe, expect, it } from "vitest";
import { ModelInputProjector } from "./model-input-projection";

describe("computeProjectionHash", () => {
  it("produces stable hashes for identical source descriptors and model metadata", () => {
    const left = new ModelInputProjector({ idFactory: () => "left" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 100 } }
    });
    const right = new ModelInputProjector({ idFactory: () => "right" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 100 } }
    });

    expect(left.hash?.value).toBe(right.hash?.value);
  });

  it("changes hashes when context budget semantics differ", () => {
    const left = new ModelInputProjector({ idFactory: () => "left" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 100 } }
    });
    const right = new ModelInputProjector({ idFactory: () => "right" }).assemble({
      runId: "run",
      turn: 0,
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: { providerId: "mock", modelId: "tiny", metadata: { providerId: "mock", modelId: "tiny", contextWindow: 200 } }
    });

    expect(left.hash?.value).not.toBe(right.hash?.value);
  });
});
