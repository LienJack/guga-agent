import type { LocalPlugin } from "@guga-agent/core";

export type EvalRunnerPluginOptions = {
  pluginId?: string;
};

export function createEvalRunnerPlugin(options: EvalRunnerPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "eval-runner";
  return {
    id: pluginId,
    name: "Eval Runner",
    init(context) {
      context.registerOperation?.("eval.run", {
        trust: {
          level: "first-party",
          scopes: [{ kind: "eval", access: "execute" }]
        }
      });
    }
  };
}
