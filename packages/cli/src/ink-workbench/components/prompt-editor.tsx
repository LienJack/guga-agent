import React from "react";
import { Box, Text } from "ink";
import type { PromptState } from "../prompt-state";

export function PromptEditor({
  prompt,
  inputMode,
  locked
}: {
  readonly prompt: PromptState;
  readonly inputMode: "steer" | "follow_up";
  readonly locked: boolean;
}) {
  const target = prompt.target.kind === "run-input" ? `run:${inputMode}` : prompt.target.kind;
  const text = prompt.editor.text.length === 0 ? " " : prompt.editor.text;
  return (
    <Box borderStyle="round" paddingX={1} flexDirection="column">
      <Text dimColor>{locked ? "locked" : target}</Text>
      <Text>{text}</Text>
    </Box>
  );
}
