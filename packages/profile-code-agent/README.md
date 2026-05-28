# @guga-agent/profile-code-agent

First-party coding-agent profile for Guga.

The profile composes existing runtime capabilities into a coding workflow bundle. It does not own execution flow and does not bypass the permission runtime.

Filesystem, shell, and git tools are composed through `@guga-agent/core/builtins` in `createCodeAgentRuntimeOptions()`. Optional integrations such as skills, MCP, ops health, audit export, and eval remain separate plugins/extensions through `createCodeAgentPlugins()`.

The profile is not an extension authoring template. New optional runtime capabilities should use `@guga-agent/extension-sdk`.
