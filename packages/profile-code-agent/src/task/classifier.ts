export type CodeTaskClassification = {
  shouldCreateTask: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  matchedSignals: string[];
};

export type ClassifyCodeTaskOptions = {
  profileId?: string;
  prompt: string;
};

const CODING_INTENT_PATTERNS = [
  /\b(implement|add|fix|refactor|change|update|debug|test|typecheck|lint|build)\b/i,
  /\b(bug|failing test|regression|feature|unit test|integration test)\b/i,
  /(实现|修复|重构|调试|加测试|补测试|跑测试|改一下|新增|完成|验证)/
] as const;

const EDIT_TARGET_PATTERNS = [
  /\bpackages?\//i,
  /\bsrc\//i,
  /\btests?\//i,
  /\b[\w.-]+\.(ts|tsx|js|jsx|py|go|rs|rb|md|json|yaml|yml)\b/i
] as const;

const QUESTION_ONLY_PATTERNS = [
  /^(explain|what is|what are|how does|why does)\b/i,
  /^(解释|说明|为什么|是什么|怎么理解)/
] as const;

const REVIEW_ONLY_PATTERNS = [
  /\b(review|code review|audit)\b/i,
  /(审查|评审|review 一下)/
] as const;

export function classifyCodeTask(options: ClassifyCodeTaskOptions): CodeTaskClassification {
  const prompt = options.prompt.trim();
  if (prompt.length === 0) {
    return {
      shouldCreateTask: false,
      confidence: "low",
      reason: "Empty prompt cannot be classified as a coding task",
      matchedSignals: []
    };
  }

  const questionOnly = matchesAny(prompt, QUESTION_ONLY_PATTERNS);
  const reviewOnly = matchesAny(prompt, REVIEW_ONLY_PATTERNS) && !matchesAny(prompt, CODING_INTENT_PATTERNS);
  if (questionOnly || reviewOnly) {
    return {
      shouldCreateTask: false,
      confidence: "low",
      reason: questionOnly
        ? "Prompt appears to ask for explanation rather than repository changes"
        : "Prompt appears to ask for review rather than execution",
      matchedSignals: [questionOnly ? "question-only" : "review-only"]
    };
  }

  const matchedSignals = [
    ...matchingSignals(prompt, CODING_INTENT_PATTERNS, "coding-intent"),
    ...matchingSignals(prompt, EDIT_TARGET_PATTERNS, "edit-target")
  ];
  if (options.profileId === "code") {
    matchedSignals.push("code-profile");
  }

  const hasIntent = matchedSignals.includes("coding-intent");
  const hasTarget = matchedSignals.includes("edit-target");
  const inCodeProfile = matchedSignals.includes("code-profile");

  if (hasIntent && (hasTarget || inCodeProfile)) {
    return {
      shouldCreateTask: true,
      confidence: hasTarget ? "high" : "medium",
      reason: hasTarget
        ? "Prompt contains coding intent and a repository/file target"
        : "Prompt contains coding intent in the code profile",
      matchedSignals: unique(matchedSignals)
    };
  }

  return {
    shouldCreateTask: false,
    confidence: "low",
    reason: "Prompt does not contain enough edit intent to safely start an autonomous coding task",
    matchedSignals: unique(matchedSignals)
  };
}

function matchesAny(prompt: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(prompt));
}

function matchingSignals(prompt: string, patterns: readonly RegExp[], signal: string): string[] {
  return matchesAny(prompt, patterns) ? [signal] : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
