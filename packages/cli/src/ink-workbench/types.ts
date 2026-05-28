import type { CliProfileId } from "../host-factory";

export type InkWorkbenchLaunchArgs = {
  debugEvents: boolean;
  mock: boolean;
  ops: boolean;
  profile?: CliProfileId;
  providerId?: string;
  modelId?: string;
};

export type InkWorkbenchWriter = {
  isTTY?: boolean;
  write(chunk: string): unknown;
};

export type InkWorkbenchStdin = NodeJS.ReadableStream & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
};

export type InkWorkbenchIO = {
  stdout: InkWorkbenchWriter;
  stderr: InkWorkbenchWriter;
  stdin?: InkWorkbenchStdin;
  env?: NodeJS.ProcessEnv;
};

export type InkWorkbenchLaunchOptions = {
  args: InkWorkbenchLaunchArgs;
  io: InkWorkbenchIO;
};
