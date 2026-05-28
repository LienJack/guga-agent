import React from "react";
import { Box, Text } from "ink";
import { getVisibleSelectorOptions, type SelectorState } from "../selector-state";

export function SelectorOverlay({ state }: { readonly state: SelectorState }) {
  const options = getVisibleSelectorOptions(state).slice(0, 8);
  return (
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      <Text bold>{state.title} {state.query ? `(${state.query})` : ""}</Text>
      {options.length === 0 ? <Text dimColor>No options.</Text> : options.map((option, index) => (
        <Text key={option.id} inverse={index === state.highlightedIndex} dimColor={option.disabled === true}>
          {option.label}{option.detail ? ` - ${option.detail}` : ""}
        </Text>
      ))}
    </Box>
  );
}
