import type { CliConfig, SelectedCliModel } from "../config";
import { isCliProfileId, type CliProfileId } from "../host-factory";
import { resolveModelRegistry, selectResolvedModel, unavailableReasonText, type ResolvedModelView } from "../model-registry";

export type ModelOption = ResolvedModelView;

export type ProfileSelection = {
  profileId: CliProfileId;
  requiresNewSession: boolean;
};

export function listModelOptions(
  config: CliConfig,
  env: NodeJS.ProcessEnv = process.env,
  credentialRoot?: string
): ModelOption[] {
  return resolveModelRegistry({
    config,
    env,
    ...(credentialRoot ? { credentialRoot } : {})
  });
}

export function selectModelOrThrow(
  config: CliConfig,
  selector: string,
  env: NodeJS.ProcessEnv = process.env,
  credentialRoot?: string
): SelectedCliModel {
  const selected = selectResolvedModel({
    config,
    selector,
    env,
    ...(credentialRoot ? { credentialRoot } : {})
  });
  if (!selected) {
    throw new Error(`Unknown model: ${selector}`);
  }
  return selected;
}

export function formatModelOption(model: ModelOption): string {
  const availability = model.available ? "" : ` [unavailable: ${unavailableReasonText(model.unavailableReasons)}]`;
  return `${model.isDefault ? "*" : " "} ${model.id} -> ${model.modelId}${availability}`;
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
