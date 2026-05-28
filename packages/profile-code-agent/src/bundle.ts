import type { AgentRuntimeOptions, LocalPlugin } from "@guga-agent/core";
import { createFilesystemPlugin, createGitPlugin, createShellPlugin } from "@guga-agent/core/builtins";
import { createAuditExportPlugin } from "@guga-agent/plugin-audit-export";
import { createEvalRunnerPlugin } from "@guga-agent/plugin-eval-runner";
import { createMcpPlugin, type McpServerConfig } from "@guga-agent/plugin-mcp";
import { createOpsHealthPlugin } from "@guga-agent/plugin-ops-health";
import { createSkillsPlugin, type SkillRoot } from "@guga-agent/plugin-skills";
import { createCodeAgentPermissionPolicy } from "./permissions";

export type CodeAgentBundleOptions = {
  workspaceRoot: string;
  skills?: {
    roots: SkillRoot[];
  };
  mcp?: {
    servers: McpServerConfig[];
  };
  includeOperations?: boolean;
};

export function createCodeAgentPlugins(options: CodeAgentBundleOptions): LocalPlugin[] {
  const plugins: LocalPlugin[] = [
    createFilesystemPlugin({
      workspaceRoot: options.workspaceRoot,
      pluginId: "code-agent-filesystem"
    }),
    createShellPlugin({
      workspaceRoot: options.workspaceRoot,
      pluginId: "code-agent-shell"
    }),
    createGitPlugin({
      workspaceRoot: options.workspaceRoot,
      pluginId: "code-agent-git"
    })
  ];

  if (options.skills && options.skills.roots.length > 0) {
    plugins.push(createSkillsPlugin({
      roots: options.skills.roots,
      pluginId: "code-agent-skills"
    }));
  }

  if (options.mcp && options.mcp.servers.length > 0) {
    plugins.push(createMcpPlugin({
      servers: options.mcp.servers,
      pluginId: "code-agent-mcp"
    }));
  }

  if (options.includeOperations ?? true) {
    plugins.push(
      createOpsHealthPlugin({ pluginId: "code-agent-ops-health" }),
      createAuditExportPlugin({ pluginId: "code-agent-audit-export" }),
      createEvalRunnerPlugin({ pluginId: "code-agent-eval-runner" })
    );
  }

  return plugins;
}

export function createCodeAgentRuntimeOptions(
  options: CodeAgentBundleOptions
): AgentRuntimeOptions {
  return {
    plugins: createCodeAgentPlugins(options),
    permissions: createCodeAgentPermissionPolicy()
  };
}
