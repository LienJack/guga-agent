export type CoreErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "TOOL_NOT_FOUND"
  | "CAPABILITY_ALREADY_REGISTERED"
  | "PROVIDER_FAILED"
  | "MAX_TURNS_EXCEEDED";

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly details?: unknown;

  constructor(code: CoreErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CoreError";
    this.code = code;
    this.details = details;
  }
}
