export type CliConfig = {
  providerId?: string;
  modelId?: string;
  providerMode?: "gateway" | "openai-compatible" | "openai" | "anthropic";
  apiKey?: string;
  baseURL?: string;
};

export function readCliConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  const apiKey = env.GUGA_API_KEY ?? env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY;
  return {
    ...(env.GUGA_PROVIDER ? { providerId: env.GUGA_PROVIDER } : {}),
    ...(env.GUGA_MODEL ? { modelId: env.GUGA_MODEL } : {}),
    ...(isProviderMode(env.GUGA_PROVIDER_MODE) ? { providerMode: env.GUGA_PROVIDER_MODE } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(env.GUGA_BASE_URL ? { baseURL: env.GUGA_BASE_URL } : {})
  };
}

function isProviderMode(value: string | undefined): value is NonNullable<CliConfig["providerMode"]> {
  return value === "gateway"
    || value === "openai-compatible"
    || value === "openai"
    || value === "anthropic";
}
