export type CliConfig = {
  providerId?: string;
  modelId?: string;
};

export function readCliConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  return {
    ...(env.GUGA_PROVIDER ? { providerId: env.GUGA_PROVIDER } : {}),
    ...(env.GUGA_MODEL ? { modelId: env.GUGA_MODEL } : {})
  };
}
