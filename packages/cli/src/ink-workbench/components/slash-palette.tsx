import React from "react";
import { Box, Text } from "ink";
import { getSlashPaletteItems, type SlashPaletteState } from "../slash-state";

export function SlashPalette({ state }: { readonly state: SlashPaletteState }) {
  if (!state.isOpen) {
    return null;
  }
  const items = getSlashPaletteItems(state).slice(0, 8);
  return (
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      <Text bold>Slash commands /{state.query}</Text>
      {items.length === 0 ? <Text dimColor>No matching commands.</Text> : items.map((command, index) => (
        <Text key={command.command} inverse={index === state.highlightedIndex} dimColor={command.availability !== "available"}>
          {command.command} - {command.help} [{command.source}{command.availability === "available" ? "" : `:${command.availability}`}]
        </Text>
      ))}
    </Box>
  );
}
