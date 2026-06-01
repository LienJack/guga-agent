export {
  BUILT_IN_CORE_OWNER,
  BUILT_IN_CORE_REGISTRATION,
  createDefaultCoreCapabilities,
  registerBuiltInCoreCapabilities
} from "./default-core-capabilities";
export type {
  BuiltInCoreCapabilityRegistration,
  BuiltInCoreCapabilitySet,
  DefaultCoreCapabilitiesOptions
} from "./default-core-capabilities";
export {
  createBuiltInFilesystemTools,
  createFilesystemPlugin,
  createLocalFilesystemBackend,
  resolveWorkspacePath
} from "./filesystem";
export type {
  BuiltInFilesystemOptions,
  FilesystemBackend,
  FilesystemPluginOptions,
  WorkspacePathResolution
} from "./filesystem";
export {
  createBuiltInGitTools,
  createGitPlugin,
  createLocalGitBackend,
  isDangerousGitOperation
} from "./git";
export type {
  BuiltInGitOptions,
  GitBackend,
  GitPluginOptions
} from "./git";
export {
  createBuiltInShellTool,
  createLocalShellBackend,
  createShellPlugin,
  filterShellEnvironment,
  summarizeCommand
} from "./shell";
export type {
  BuiltInShellOptions,
  ShellBackend,
  ShellExecutionResult,
  ShellPluginOptions
} from "./shell";
export {
  createAiSdkProvider,
  createAiSdkProviderPlugin,
  createBuiltInAiSdkProviderCapabilities,
  createModel,
  mapAiSdkResultToProviderResponse,
  redactAiSdkMetadata
} from "../provider-ai-sdk/index";
export type {
  AiSdkBridgeMode,
  AiSdkGenerateText,
  AiSdkGenerateTextResult,
  AiSdkProviderConfig,
  AiSdkProviderFactoryOptions,
  AiSdkToolCallLike,
  BuiltInAiSdkProviderCapabilities
} from "../provider-ai-sdk/index";
export { mapCoreMessagesToAiSdk } from "../provider-ai-sdk/message-mapper";
export type { AiSdkModelMessage } from "../provider-ai-sdk/message-mapper";
export { mapToolsToAiSdk } from "../provider-ai-sdk/tool-mapper";
export type { AiSdkToolSpec } from "../provider-ai-sdk/tool-mapper";
export {
  AiSdkProviderErrorCategory,
  mapAiSdkError,
  mapAiSdkFinishReason,
  mapAiSdkUsage,
  redactSensitiveText
} from "../provider-ai-sdk/usage-error-mapper";
export type { AiSdkUsageLike } from "../provider-ai-sdk/usage-error-mapper";
