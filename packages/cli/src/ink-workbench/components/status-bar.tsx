import React from "react";
import { Box, Text } from "ink";
import type { StatusBarViewModel } from "../../workbench/views";

export function StatusBar({ status }: { readonly status: StatusBarViewModel }) {
  const lock = status.inputLocked ? ` | locked: ${status.inputLockHint ?? status.disconnectedReason ?? "disconnected"}` : "";
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text>
        {status.runStatus} | {status.text} | {status.queueLabel} | {status.usageLabel}
        {lock}
      </Text>
    </Box>
  );
}
