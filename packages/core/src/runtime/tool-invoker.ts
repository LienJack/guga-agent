import type { AgentRuntime } from "../contracts/runtime";
import type { RuntimeToolInvokeOptions, ToolRuntimeResult } from "../contracts/tool-runtime";

export type RuntimeToolInvoker = {
  invokeTool(options: RuntimeToolInvokeOptions): Promise<ToolRuntimeResult>;
};

export function createRuntimeToolInvoker(runtime: Pick<AgentRuntime, "invokeTool">): RuntimeToolInvoker {
  return {
    invokeTool(options) {
      return runtime.invokeTool(options);
    }
  };
}
