import type {
  ToolDefinition,
  ToolEffect,
  ToolPermissionMetadata,
  ToolRuntimeMetadata,
  TrustDescriptor
} from "@guga-agent/core";
import type { McpCallToolResult, McpStdioClient, McpToolInfo } from "./mcp-stdio-client";

const MAX_MCP_DESCRIPTION_LENGTH = 2048;

export type McpToolPolicy = {
  effect?: ToolEffect;
  action?: ToolRuntimeMetadata["action"];
  permission?: ToolPermissionMetadata;
  principal?: ToolRuntimeMetadata["principal"];
  credentials?: ToolRuntimeMetadata["credentials"];
  sandbox?: ToolRuntimeMetadata["sandbox"];
  environment?: ToolRuntimeMetadata["environment"];
  backend?: ToolRuntimeMetadata["backend"];
  resultBudget?: ToolRuntimeMetadata["resultBudget"];
  renderer?: ToolRuntimeMetadata["renderer"];
  eval?: ToolRuntimeMetadata["eval"];
  trust?: TrustDescriptor;
  debug?: ToolRuntimeMetadata["debug"];
};

export type McpToolPolicyResolver = (input: {
  serverName: string;
  tool: McpToolInfo;
  defaultPolicy: McpToolPolicy;
}) => McpToolPolicy | undefined;

export function mcpToolName(serverName: string, toolName: string): string {
  return `mcp__${sanitizeToolPart(serverName)}__${sanitizeToolPart(toolName)}`;
}

export function createMcpToolDefinition(options: {
  serverName: string;
  tool: McpToolInfo;
  client: McpStdioClient;
  policy?: McpToolPolicy | McpToolPolicyResolver;
}): ToolDefinition {
  const defaultPolicy = defaultMcpToolPolicy(options.serverName, options.tool);
  const policy = mergeMcpToolPolicy(
    defaultPolicy,
    typeof options.policy === "function"
      ? options.policy({ serverName: options.serverName, tool: options.tool, defaultPolicy })
      : options.policy
  );

  return {
    name: mcpToolName(options.serverName, options.tool.name),
    description: truncateDescription(options.tool.description ?? `MCP tool ${options.tool.name} from ${options.serverName}`),
    inputSchema: options.tool.inputSchema ?? { type: "object", additionalProperties: true },
    effect: policy.effect ?? "external",
    runtime: {
      ...(policy.permission ? { permission: policy.permission } : {}),
      ...(policy.action ? { action: policy.action } : {}),
      ...(policy.principal ? { principal: policy.principal } : {}),
      ...(policy.credentials ? { credentials: policy.credentials } : {}),
      ...(policy.sandbox ? { sandbox: policy.sandbox } : {}),
      ...(policy.environment ? { environment: policy.environment } : {}),
      ...(policy.backend ? { backend: policy.backend } : {}),
      ...(policy.resultBudget ? { resultBudget: policy.resultBudget } : {}),
      ...(policy.renderer ? { renderer: policy.renderer } : {}),
      source: {
        kind: "mcp",
        namespace: sanitizeToolPart(options.serverName),
        upstreamId: `${options.serverName}/${options.tool.name}`,
        debugName: options.serverName,
        ...(policy.trust ? { trust: policy.trust } : {})
      },
      ...(policy.eval ? { eval: policy.eval } : {}),
      ...(policy.debug ? { debug: policy.debug } : {})
    },
    async execute(input) {
      const result = await options.client.callTool(options.tool.name, input);
      if (result.isError) {
        return {
          ok: false,
          error: {
            code: "MCP_TOOL_ERROR",
            message: stringifyMcpToolResult(result)
          },
          metadata: mcpResultMetadata(options.serverName, options.tool.name)
        };
      }
      return {
        ok: true,
        content: stringifyMcpToolResult(result),
        metadata: mcpResultMetadata(options.serverName, options.tool.name)
      };
    }
  };
}

function defaultMcpToolPolicy(serverName: string, tool: McpToolInfo): McpToolPolicy {
  const annotations = tool.annotations ?? {};
  const readOnly = annotations.readOnlyHint === true && annotations.destructiveHint !== true;
  const openWorld = annotations.openWorldHint !== false;
  const effect: ToolEffect = readOnly && !openWorld ? "read" : "external";
  const risk = readOnly && !openWorld ? "medium" : "high";
  const category = readOnly && !openWorld ? "read" : "external";

  return {
    effect,
    action: {
      category,
      risk,
      label: `MCP ${tool.name}`,
      summary: `Call MCP tool ${tool.name} on server ${serverName}`,
      effects: [{
        kind: openWorld ? "network" : "custom",
        access: readOnly ? "read" : "execute",
        target: `mcp:${serverName}/${tool.name}`,
        external: true,
        irreversible: annotations.destructiveHint === true,
        metadata: {
          serverName,
          toolName: tool.name,
          openWorld,
          readOnly,
          ...(annotations.idempotentHint !== undefined ? { idempotent: annotations.idempotentHint } : {})
        }
      }],
      tags: ["mcp", openWorld ? "open-world" : "declared-scope", readOnly ? "read-only" : "server-action"]
    },
    permission: {
      defaultAction: "ask",
      profileActions: { headless: "deny", background: "deny" },
      scope: "resource",
      reason: "MCP tools call server-controlled capabilities outside the core runtime.",
      prompt: { title: "Call MCP tool", summary: `${serverName}/${tool.name}` }
    },
    backend: {
      kind: "custom",
      description: `MCP server ${serverName}`
    },
    resultBudget: {
      maxContentChars: 12_000,
      strategy: "reference"
    },
    renderer: {
      category: "custom",
      label: `MCP ${tool.name}`,
      icon: "plug"
    },
    trust: {
      level: "untrusted",
      scopes: [
        { kind: "mcp.server", access: "call-tool", value: serverName },
        { kind: "mcp.tool", access: "execute", value: tool.name }
      ],
      reason: "MCP tool behavior is supplied by an external server at runtime."
    },
    eval: {
      categories: ["tool-action", "mcp"],
      coveredRisks: [risk],
      expectedUseCases: [`Use when the user explicitly needs ${tool.name} from MCP server ${serverName}.`],
      unsafeUseCases: ["Do not call for unrelated tasks or when a lower-risk local tool can satisfy the request."],
      selectionTags: ["mcp", serverName, tool.name, openWorld ? "open-world" : "declared-scope"],
      auditRequirements: ["Record MCP server name, upstream tool name, action risk, permission decision, and result evidence."]
    }
  };
}

function mergeMcpToolPolicy(defaultPolicy: McpToolPolicy, override: McpToolPolicy | undefined): McpToolPolicy {
  if (!override) {
    return defaultPolicy;
  }
  return {
    ...defaultPolicy,
    ...override,
    ...(override.action ?? defaultPolicy.action ? { action: override.action ?? defaultPolicy.action } : {}),
    ...(override.permission ?? defaultPolicy.permission ? { permission: override.permission ?? defaultPolicy.permission } : {}),
    ...(override.backend ?? defaultPolicy.backend ? { backend: override.backend ?? defaultPolicy.backend } : {}),
    ...(override.resultBudget ?? defaultPolicy.resultBudget ? { resultBudget: override.resultBudget ?? defaultPolicy.resultBudget } : {}),
    ...(override.renderer ?? defaultPolicy.renderer ? { renderer: override.renderer ?? defaultPolicy.renderer } : {}),
    ...(override.trust ?? defaultPolicy.trust ? { trust: override.trust ?? defaultPolicy.trust } : {}),
    ...(override.eval ?? defaultPolicy.eval ? { eval: override.eval ?? defaultPolicy.eval } : {})
  };
}

function mcpResultMetadata(serverName: string, toolName: string): Record<string, unknown> {
  return {
    serverName,
    toolName,
    evidence: {
      source: "mcp",
      rawSource: `mcp:${serverName}/${toolName}`,
      verifier: { status: "unverified" },
      redaction: { state: "none" }
    }
  };
}

export function stringifyMcpToolResult(result: McpCallToolResult): string {
  if (!Array.isArray(result.content)) {
    return JSON.stringify(result);
  }
  return result.content.map((item) => {
    if (isObject(item) && item.type === "text" && typeof item.text === "string") {
      return item.text;
    }
    return JSON.stringify(item);
  }).join("\n");
}

function truncateDescription(description: string): string {
  return description.length > MAX_MCP_DESCRIPTION_LENGTH
    ? description.slice(0, MAX_MCP_DESCRIPTION_LENGTH)
    : description;
}

function sanitizeToolPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
