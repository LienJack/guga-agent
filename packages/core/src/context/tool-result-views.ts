import type { ToolCall } from "../contracts/messages";
import type { ToolRendererCategory, ToolResultReference } from "../contracts/tool-runtime";
import type { ToolDefinition, ToolResult } from "../contracts/tools";

export type ToolResultPreviewOptions = {
  call: ToolCall;
  result: ToolResult;
  tool?: ToolDefinition;
  content: string;
  maxContentChars: number;
  reference?: ToolResultReference;
};

export type ToolResultPreview = {
  llmPreview: string;
  uiProjection: string;
  omitted: boolean;
  notice: string;
  rereadInstruction?: string;
};

export function createToolResultPreview(options: ToolResultPreviewOptions): ToolResultPreview {
  const category = options.tool?.runtime?.renderer?.category ?? inferCategory(options.call.name);
  const previewContent = previewByCategory(category, options.content, Math.max(0, options.maxContentChars));
  const omitted = options.content.length > previewContent.length;
  const referenceText = options.reference
    ? ` Full output reference: ${options.reference.id}.`
    : "";
  const rereadInstruction = options.reference
    ? `Request tool result ${options.reference.id} if the omitted output is needed.`
    : undefined;
  const notice = omitted
    ? `Tool output preview omitted ${options.content.length - previewContent.length} characters.${referenceText}`
    : "Tool output fits within the model preview budget.";

  return {
    llmPreview: omitted ? `${previewContent}\n\n[${notice}]` : previewContent,
    uiProjection: omitted ? previewContent : options.content,
    omitted,
    notice,
    ...(rereadInstruction ? { rereadInstruction } : {})
  };
}

function previewByCategory(category: ToolRendererCategory, content: string, maxContentChars: number): string {
  switch (category) {
    case "execute":
      return headTail(content, maxContentChars);
    case "search":
      return content.split("\n").slice(0, Math.max(1, Math.floor(maxContentChars / 120))).join("\n").slice(0, maxContentChars);
    case "read":
    case "git":
    case "edit":
    case "custom":
      return content.slice(0, maxContentChars);
  }
}

function headTail(content: string, maxContentChars: number): string {
  if (content.length <= maxContentChars) {
    return content;
  }
  if (maxContentChars <= 32) {
    return content.slice(0, maxContentChars);
  }
  const half = Math.max(1, Math.floor((maxContentChars - 32) / 2));
  return `${content.slice(0, half)}\n...[middle omitted]...\n${content.slice(-half)}`.slice(0, maxContentChars);
}

function inferCategory(toolName: string): ToolRendererCategory {
  if (toolName.includes("search") || toolName.includes("grep")) {
    return "search";
  }
  if (toolName.includes("shell") || toolName.includes("exec") || toolName.includes("test")) {
    return "execute";
  }
  if (toolName.includes("git")) {
    return "git";
  }
  if (toolName.includes("read")) {
    return "read";
  }
  return "custom";
}
