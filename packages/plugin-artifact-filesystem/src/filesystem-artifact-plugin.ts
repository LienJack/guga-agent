import type { LocalPlugin } from "@guga-agent/core";
import { FilesystemArtifactStore, type FilesystemArtifactStoreOptions } from "./filesystem-artifact-store";

export type FilesystemArtifactPluginOptions = FilesystemArtifactStoreOptions & {
  pluginId?: string;
};

export function createFilesystemArtifactPlugin(options: FilesystemArtifactPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-artifact-filesystem";
  const store = new FilesystemArtifactStore(options);

  return {
    id: pluginId,
    name: "Guga Filesystem Artifact Store",
    init(context) {
      if (!context.registerArtifactStore) {
        throw new Error("Plugin context does not support artifact store registration");
      }
      context.registerArtifactStore(store);
    }
  };
}
