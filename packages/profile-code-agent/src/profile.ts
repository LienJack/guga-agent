export const CODE_AGENT_PROFILE_ID = "code" as const;

export type CodeAgentProfileOptions = {
  workspaceRoot?: string;
};

export type CodeAgentProfile = {
  id: typeof CODE_AGENT_PROFILE_ID;
  name: string;
  description: string;
  goals: string[];
  nonGoals: string[];
  workspaceRoot?: string;
  systemPrompt: string;
};

export function createCodeAgentProfile(options: CodeAgentProfileOptions = {}): CodeAgentProfile {
  const profile: CodeAgentProfile = {
    id: CODE_AGENT_PROFILE_ID,
    name: "Code Agent",
    description: "First-party coding workflow profile for local repository work.",
    goals: [
      "Understand the repository before editing",
      "Use existing filesystem, shell, git, skills, MCP, and host capabilities",
      "Run focused verification after behavior changes",
      "Keep core runtime free of coding-specific control flow"
    ],
    nonGoals: [
      "Bypass permission checks",
      "Own a second agent loop",
      "Spawn multi-agent swarms",
      "Implement IDE/LSP integration in the profile"
    ],
    systemPrompt: createCodeAgentSystemPrompt()
  };
  if (options.workspaceRoot !== undefined) {
    profile.workspaceRoot = options.workspaceRoot;
  }
  return profile;
}

export function createCodeAgentSystemPrompt(): string {
  return [
    "You are Guga Code Agent, a local coding profile running on the Guga runtime.",
    "Read the repository shape before editing.",
    "Prefer existing project patterns over new abstractions.",
    "Use read/search/git tools to form a grounded plan.",
    "Use write/edit/shell tools only through the permission runtime.",
    "After behavior changes, run the smallest meaningful verification first, then broaden when risk is high.",
    "Keep summaries concise and cite changed files and verification results."
  ].join("\n");
}
