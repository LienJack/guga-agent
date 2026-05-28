import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { HostRuntime, type HostRuntimeOptions } from "@guga-agent/host-runtime";
import { createHostRequestHandler } from "./routes";

export type HostLocalServerOptions = {
  hostRuntime?: HostRuntime;
  runtimeOptions?: HostRuntimeOptions;
  pollIntervalMs?: number;
  disposeRuntimeOnClose?: boolean;
};

export type HostLocalServerListenOptions = {
  host?: string;
  port?: number;
};

export class HostLocalServer {
  readonly hostRuntime: HostRuntime;
  private readonly disposeRuntimeOnClose: boolean;
  private readonly server: Server;
  private urlValue: string | undefined;

  constructor(options: HostLocalServerOptions = {}) {
    this.hostRuntime = options.hostRuntime ?? new HostRuntime(options.runtimeOptions);
    this.disposeRuntimeOnClose = options.disposeRuntimeOnClose ?? true;
    this.server = createServer(createHostRequestHandler(this.hostRuntime, {
      ...(options.pollIntervalMs !== undefined ? { pollIntervalMs: options.pollIntervalMs } : {})
    }));
  }

  async listen(options: HostLocalServerListenOptions = {}): Promise<string> {
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? 0;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(port, host);
    });
    const address = this.server.address() as AddressInfo;
    this.urlValue = `http://${address.address}:${address.port}`;
    return this.urlValue;
  }

  get url(): string {
    if (!this.urlValue) {
      throw new Error("Host local server is not listening");
    }
    return this.urlValue;
  }

  async close(): Promise<void> {
    if (this.server.listening) {
      await new Promise<void>((resolve, reject) => {
        this.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    if (this.disposeRuntimeOnClose) {
      await this.hostRuntime.dispose();
    }
  }
}

export function createHostLocalServer(options: HostLocalServerOptions = {}): HostLocalServer {
  return new HostLocalServer(options);
}
