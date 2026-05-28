import { runEvalSuite } from "@guga-agent/plugin-eval-runner";
import { describe, expect, it } from "vitest";
import {
  createFlywheelEvalManifest,
  flywheelEvalFixtures,
  getFlywheelFixturesByCategory,
  validateFlywheelEvalFixtures
} from "./index";

describe("eval-fixtures", () => {
  it("builds a complete cross-module manifest", () => {
    expect(validateFlywheelEvalFixtures(flywheelEvalFixtures)).toEqual([]);
    expect(createFlywheelEvalManifest(flywheelEvalFixtures)).toEqual({
      fixtureCount: 5,
      categories: [
        { category: "capability-discovery", count: 1, fixtureIds: ["m6-capability-discovery-summary"] },
        { category: "host-protocol", count: 1, fixtureIds: ["m7-host-protocol-event-stream"] },
        { category: "production-ops", count: 1, fixtureIds: ["m8-production-ops-health"] },
        { category: "code-agent", count: 1, fixtureIds: ["m9-code-agent-task-boundary"] },
        { category: "deep-research", count: 1, fixtureIds: ["m10-deep-research-evidence-ledger"] }
      ],
      modules: ["M10", "M6", "M7/M11", "M8", "M9"]
    });
  });

  it("filters fixtures by category", () => {
    expect(getFlywheelFixturesByCategory(flywheelEvalFixtures, "deep-research").map((fixture) => fixture.id)).toEqual([
      "m10-deep-research-evidence-ledger"
    ]);
  });

  it("returns metadata diagnostics for incomplete registries", () => {
    const { runId: _runId, ...fixtureWithoutRunId } = flywheelEvalFixtures[0];

    expect(validateFlywheelEvalFixtures([
      {
        ...fixtureWithoutRunId,
        id: "broken",
        covers: "",
        tags: []
      }
    ])).toEqual([
      "Fixture broken must include at least one tag",
      "Fixture broken must describe covered risk",
      "Fixture broken must use a stable runId",
      "Missing fixture category: host-protocol",
      "Missing fixture category: production-ops",
      "Missing fixture category: code-agent",
      "Missing fixture category: deep-research"
    ]);
  });

  it("runs all fixtures through the hermetic eval runner", async () => {
    await expect(runEvalSuite([...flywheelEvalFixtures])).resolves.toMatchObject({
      ok: true,
      passed: 5,
      failed: 0
    });
  });
});
