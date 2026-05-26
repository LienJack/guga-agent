import type { AgentRuntimeOptions } from "../contracts/runtime";
import { AgentRuntime } from "./agent-runtime";

export function createAgentRuntime(options: AgentRuntimeOptions = {}): AgentRuntime {
  return new AgentRuntime(options);
}
