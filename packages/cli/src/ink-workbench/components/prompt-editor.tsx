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
  return (
    <Box borderStyle="round" paddingX={1} flexDirection="column">
      <Text dimColor>{locked ? "locked" : target}</Text>
      <Text>{renderCursorText(prompt.editor.text, prompt.editor.cursor)}</Text>
    </Box>
  );
}

function renderCursorText(text: string, cursor: number): React.ReactNode {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const nextCharacter = Array.from(after)[0];
  const cursorText = !nextCharacter || nextCharacter === "\n" ? " " : nextCharacter;
  const rest = nextCharacter && nextCharacter !== "\n" ? after.slice(nextCharacter.length) : after;

  return (
    <>
      {before}
      <Text inverse>{cursorText}</Text>
      {rest}
    </>
  );
}
