import type { EvalFixture } from "@guga-agent/plugin-eval-runner";

export type EvalFixtureCategory =
  | "capability-discovery"
  | "host-protocol"
  | "production-ops"
  | "code-agent"
  | "deep-research";

export type EvalFixtureLayer =
  | "provider"
  | "tool"
  | "context"
  | "permission"
  | "session"
  | "protocol"
  | "profile";

export type FlywheelEvalFixture = EvalFixture & {
  module: "M6" | "M7/M11" | "M8" | "M9" | "M10";
  category: EvalFixtureCategory;
  layer: EvalFixtureLayer;
  covers: string;
  tags: string[];
};

export type FlywheelEvalManifestCategory = {
  category: EvalFixtureCategory;
  count: number;
  fixtureIds: string[];
};

export type FlywheelEvalManifest = {
  fixtureCount: number;
  categories: FlywheelEvalManifestCategory[];
  modules: string[];
};

const categoryOrder: EvalFixtureCategory[] = [
  "capability-discovery",
  "host-protocol",
  "production-ops",
  "code-agent",
  "deep-research"
];

export function getFlywheelFixturesByCategory(
  fixtures: readonly FlywheelEvalFixture[],
  category: EvalFixtureCategory
): FlywheelEvalFixture[] {
  return fixtures.filter((fixture) => fixture.category === category);
}

export function createFlywheelEvalManifest(fixtures: readonly FlywheelEvalFixture[]): FlywheelEvalManifest {
  const categories = categoryOrder.map((category) => {
    const categoryFixtures = getFlywheelFixturesByCategory(fixtures, category);
    return {
      category,
      count: categoryFixtures.length,
      fixtureIds: categoryFixtures.map((fixture) => fixture.id).sort()
    };
  });
  return {
    fixtureCount: fixtures.length,
    categories,
    modules: Array.from(new Set(fixtures.map((fixture) => fixture.module))).sort()
  };
}

export function validateFlywheelEvalFixtures(fixtures: readonly FlywheelEvalFixture[]): string[] {
  const diagnostics: string[] = [];
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (ids.has(fixture.id)) {
      diagnostics.push(`Duplicate fixture id: ${fixture.id}`);
    }
    ids.add(fixture.id);
    if (fixture.tags.length === 0) {
      diagnostics.push(`Fixture ${fixture.id} must include at least one tag`);
    }
    if (fixture.covers.trim().length === 0) {
      diagnostics.push(`Fixture ${fixture.id} must describe covered risk`);
    }
    if (fixture.runId === undefined) {
      diagnostics.push(`Fixture ${fixture.id} must use a stable runId`);
    }
  }

  const manifest = createFlywheelEvalManifest(fixtures);
  for (const category of manifest.categories) {
    if (category.count === 0) {
      diagnostics.push(`Missing fixture category: ${category.category}`);
    }
  }
  return diagnostics;
}
