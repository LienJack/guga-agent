import type { LocalPlugin } from "@guga-agent/core";
import { JsonlEventStore, type JsonlEventStoreOptions } from "./jsonl-event-store";
import { JsonlSessionStore, type JsonlSessionStoreOptions } from "./jsonl-session-store";

export type JsonlSessionPluginOptions = {
  rootDir: string;
  pluginId?: string;
} & Pick<JsonlEventStoreOptions, "upcasters"> & Pick<JsonlSessionStoreOptions, "now">;

export function createJsonlSessionPlugin(options: JsonlSessionPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-session-jsonl";
  return {
    id: pluginId,
    name: "Guga JSONL Session Store",
    init(context) {
      if (!context.registerEventStore || !context.registerSessionStore) {
        throw new Error("Plugin context does not support persistence store registration");
      }
      context.registerEventStore(new JsonlEventStore({
        rootDir: options.rootDir,
        ...(options.upcasters ? { upcasters: options.upcasters } : {})
      }));
      context.registerSessionStore(new JsonlSessionStore({
        rootDir: options.rootDir,
        ...(options.now ? { now: options.now } : {})
      }));
    }
  };
}
