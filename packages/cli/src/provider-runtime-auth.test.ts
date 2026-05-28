import { describe, expect, it } from "vitest";
import { providerRuntimeAuthForSelection } from "./provider-runtime-auth";

describe("provider runtime auth", () => {
  it("passes API key material through for API-key providers", () => {
    expect(providerRuntimeAuthForSelection({
      id: "openai",
      providerId: "openai",
      modelId: "gpt-test",
      apiKey: "sk-test"
    })).toEqual({ apiKey: "sk-test" });
  });

  it("converts OAuth access tokens into SDK-neutral bearer headers", () => {
    expect(providerRuntimeAuthForSelection({
      id: "copilot",
      providerId: "copilot",
      providerMode: "openai-compatible",
      modelId: "gpt-5.4",
      accessToken: "gho-copilot-secret",
      tokenType: "bearer"
    })).toEqual({
      headers: {
        Authorization: "Bearer gho-copilot-secret"
      }
    });
  });

  it("marks Codex OAuth requests with provider options without changing core contracts", () => {
    expect(providerRuntimeAuthForSelection({
      id: "codex",
      providerId: "codex",
      providerMode: "openai",
      modelId: "gpt-5.4",
      accessToken: "codex-secret"
    })).toEqual({
      headers: {
        Authorization: "Bearer codex-secret"
      },
      providerOptions: {
        openaiCodex: { authMode: "chatgpt" }
      }
    });
  });
});
