import {
  HostLocalServer,
  type HostLocalServerListenOptions,
  type HostLocalServerOptions
} from "@guga-agent/host-local-server";
import { connectHost, type HostClient } from "./client";

export type LocalGugaHostOptions = HostLocalServerOptions & {
  listen?: HostLocalServerListenOptions;
};

export type LocalGugaHost = {
  baseUrl: string;
  client: HostClient;
  server: HostLocalServer;
  close(): Promise<void>;
};

export async function createLocalGugaHost(options: LocalGugaHostOptions = {}): Promise<LocalGugaHost> {
  const server = new HostLocalServer(options);
  const baseUrl = await server.listen(options.listen);
  return {
    baseUrl,
    client: connectHost({ baseUrl }),
    server,
    close: () => server.close()
  };
}
