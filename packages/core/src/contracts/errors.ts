export type CoreErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "MODEL_NOT_FOUND"
  | "ROUTER_FAILED"
  | "TOOL_NOT_FOUND"
  | "PERSISTENCE_CAPABILITY_NOT_FOUND"
  | "CAPABILITY_ALREADY_REGISTERED"
  | "CAPABILITY_OVERRIDE_DENIED"
  | "INVALID_CAPABILITY_DESCRIPTOR"
  | "PROVIDER_FAILED"
  | "MAX_TURNS_EXCEEDED"
  | "PLUGIN_INIT_FAILED"
  | "PLUGIN_SHUTDOWN_FAILED"
  | "HOOK_FAILED"
  | "RUNTIME_DISPOSED";

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
