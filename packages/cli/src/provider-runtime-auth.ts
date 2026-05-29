import type { AiSdkProviderConfig } from "@guga-agent/core/builtins";
import type { SelectedCliModel } from "./config";

export type ProviderRuntimeAuthConfig = Pick<AiSdkProviderConfig, "apiKey" | "headers" | "providerOptions">;

export function providerRuntimeAuthForSelection(
  selected: SelectedCliModel | undefined
): ProviderRuntimeAuthConfig {
  if (!selected) {
    return {};
  }
  if (selected.providerId === "codex" && selected.sessionKind === "codex-app-server") {
    return {
      providerOptions: {
        openaiCodex: {
          authMode: selected.authMode ?? "chatgpt",
          sessionKind: selected.sessionKind,
          ...(selected.planType ? { planType: selected.planType } : {})
        }
      }
    };
  }
  if (selected.accessToken) {
    const tokenType = selected.tokenType ?? "Bearer";
    return {
      headers: {
        Authorization: `${capitalizeTokenType(tokenType)} ${selected.accessToken}`
      },
      ...(selected.providerId === "codex" ? {
        providerOptions: { openaiCodex: { authMode: "chatgpt" } }
      } : {})
    };
  }
  return selected.apiKey ? { apiKey: selected.apiKey } : {};
}

function capitalizeTokenType(value: string): string {
  return value.length === 0
    ? "Bearer"
    : `${value[0]?.toUpperCase() ?? "B"}${value.slice(1)}`;
}
