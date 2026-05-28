import type { CliConfig, SelectedCliModel } from "../config";
import { listCliModels, selectCliModel } from "../config";
import { isCliProfileId, type CliProfileId } from "../host-factory";

export type ModelOption = SelectedCliModel & {
  isDefault: boolean;
};

export type ProfileSelection = {
  profileId: CliProfileId;
  requiresNewSession: boolean;
};

export function listModelOptions(config: CliConfig): ModelOption[] {
  const defaultId = config.defaultModel ?? config.modelId;
  return listCliModels(config).map((model, index) => ({
    ...model,
    isDefault: model.id === defaultId || (defaultId === undefined && index === 0)
  }));
}

export function selectModelOrThrow(
  config: CliConfig,
  selector: string,
  env: NodeJS.ProcessEnv = process.env
): SelectedCliModel {
  const selected = selectCliModel(config, selector, env);
  if (!selected) {
    throw new Error(`Unknown model: ${selector}`);
  }
  return selected;
}

export function selectProfileOrThrow(selector: string): ProfileSelection {
  if (!isCliProfileId(selector)) {
    throw new Error(`Unknown profile: ${selector}`);
  }
  return {
    profileId: selector,
    requiresNewSession: true
  };
}
