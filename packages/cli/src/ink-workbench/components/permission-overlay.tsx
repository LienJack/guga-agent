import React from "react";
import { Box, Text } from "ink";
import type { PendingInteractionViewModel, PendingPermissionViewModel } from "../../workbench/views";

export function PermissionOverlay({
  permission,
  interaction
}: {
  readonly permission: PendingPermissionViewModel | undefined;
  readonly interaction: PendingInteractionViewModel | undefined;
}) {
  if (permission) {
    return (
      <Box borderStyle="single" paddingX={1} flexDirection="column">
        <Text bold>{permission.title}</Text>
        <Text color={permission.riskLabel === "high risk" ? "yellow" : "white"}>Risk: {permission.riskLabel}</Text>
        <Text dimColor>{permission.scopeLabel}</Text>
        {permission.detail ? <Text>{permission.detail}</Text> : null}
        {permission.inputPreview ? <Text dimColor>input {permission.inputPreview}</Text> : null}
        <Text>{permission.responseHint}</Text>
      </Box>
    );
  }
  if (interaction) {
    return (
      <Box borderStyle="single" paddingX={1} flexDirection="column">
        <Text bold>{interaction.title}</Text>
        <Text dimColor>{interaction.scopeLabel}</Text>
        {interaction.detail ? <Text>{interaction.detail}</Text> : null}
        <Text>{interaction.responseHint}</Text>
      </Box>
    );
  }
  return null;
}
