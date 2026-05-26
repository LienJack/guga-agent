import type { Provider, ProviderRequest, ProviderResponse } from "../contracts/provider";

export type MockProviderStep =
  | ProviderResponse
  | ((request: ProviderRequest, callIndex: number) => ProviderResponse | Promise<ProviderResponse>);

export type MockProviderOptions = {
  id?: string;
};

export function createMockProvider(steps: MockProviderStep[], options: MockProviderOptions = {}): Provider {
  let callIndex = 0;

  return {
    id: options.id ?? "mock",
    async generate(request) {
      const step = steps[callIndex];
      callIndex += 1;

      if (!step) {
        return {
          type: "failure",
          error: {
            code: "MOCK_PROVIDER_EXHAUSTED",
            message: "Mock provider has no response for this request",
            details: { callIndex }
          }
        };
      }

      return typeof step === "function" ? step(request, callIndex - 1) : step;
    }
  };
}
