import type { PackageScripts } from "./repo-context";

export type TestCommandCandidate = {
  command: string;
  scriptName?: string;
  reason: string;
  confidence: "high" | "medium" | "low";
};

export type DiscoverTestCommandsOptions = {
  packageManager?: "pnpm" | "npm" | "yarn" | "bun";
  packageScripts?: PackageScripts;
  changedFiles?: string[];
};

const TEST_SCRIPT_NAMES = [
  "test",
  "test:unit",
  "test:ci",
  "typecheck",
  "lint",
  "build"
] as const;

export function discoverTestCommands(options: DiscoverTestCommandsOptions = {}): TestCommandCandidate[] {
  const packageManager = options.packageManager ?? "pnpm";
  const scripts = options.packageScripts ?? {};
  const changedFiles = options.changedFiles ?? [];
  const candidates: TestCommandCandidate[] = [];

  for (const scriptName of TEST_SCRIPT_NAMES) {
    if (scripts[scriptName]) {
      candidates.push({
        command: `${packageManager} ${scriptName}`,
        scriptName,
        reason: `${scriptName} script is defined in package scripts`,
        confidence: scriptName === "test" || scriptName === "typecheck" ? "high" : "medium"
      });
    }
  }

  if (changedFiles.some((file) => file.endsWith(".ts") || file.endsWith(".tsx")) && scripts.typecheck && !hasScript(candidates, "typecheck")) {
    candidates.push({
      command: `${packageManager} typecheck`,
      scriptName: "typecheck",
      reason: "TypeScript files changed and typecheck script exists",
      confidence: "high"
    });
  }

  if (changedFiles.some((file) => file.includes("/src/") || file.endsWith(".test.ts") || file.endsWith(".spec.ts")) && scripts.test && !hasScript(candidates, "test")) {
    candidates.push({
      command: `${packageManager} test`,
      scriptName: "test",
      reason: "Source or test files changed and test script exists",
      confidence: "high"
    });
  }

  if (candidates.length === 0 && changedFiles.length > 0) {
    candidates.push({
      command: `${packageManager} test`,
      reason: "Changed files were provided but no package scripts were available; use default test command if supported",
      confidence: "low"
    });
  }

  return dedupeCandidates(candidates);
}

function hasScript(candidates: TestCommandCandidate[], scriptName: string): boolean {
  return candidates.some((candidate) => candidate.scriptName === scriptName);
}

function dedupeCandidates(candidates: TestCommandCandidate[]): TestCommandCandidate[] {
  const seen = new Set<string>();
  const result: TestCommandCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.command)) {
      continue;
    }
    seen.add(candidate.command);
    result.push(candidate);
  }
  return result;
}
