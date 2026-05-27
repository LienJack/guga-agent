export type PackageScripts = Record<string, string>;

export type RepoContext = {
  workspaceRoot: string;
  gitStatus?: string;
  activeFiles: string[];
  packageScripts: PackageScripts;
  notes: string[];
};

export type BuildRepoContextOptions = {
  workspaceRoot: string;
  gitStatus?: string;
  activeFiles?: string[];
  packageScripts?: PackageScripts;
  notes?: string[];
};

export function buildRepoContext(options: BuildRepoContextOptions): RepoContext {
  const context: RepoContext = {
    workspaceRoot: options.workspaceRoot,
    activeFiles: uniqueSorted(options.activeFiles ?? []),
    packageScripts: sortScripts(options.packageScripts ?? {}),
    notes: (options.notes ?? []).filter((note) => note.trim().length > 0)
  };
  const gitStatus = options.gitStatus?.trim();
  if (gitStatus) {
    context.gitStatus = gitStatus;
  }
  return context;
}

export function renderRepoContext(context: RepoContext): string {
  const lines = [
    `Workspace: ${context.workspaceRoot}`,
    `Active files: ${context.activeFiles.length === 0 ? "(none)" : context.activeFiles.join(", ")}`,
    `Scripts: ${Object.keys(context.packageScripts).length === 0 ? "(none)" : Object.keys(context.packageScripts).join(", ")}`
  ];
  if (context.gitStatus) {
    lines.push("Git status:");
    lines.push(context.gitStatus);
  }
  if (context.notes.length > 0) {
    lines.push("Notes:");
    lines.push(...context.notes.map((note) => `- ${note}`));
  }
  return lines.join("\n");
}

function sortScripts(scripts: PackageScripts): PackageScripts {
  return Object.fromEntries(
    Object.entries(scripts)
      .filter(([name, command]) => name.trim().length > 0 && command.trim().length > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
