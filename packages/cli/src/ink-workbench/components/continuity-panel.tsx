import React from "react";
import { Box, Text } from "ink";
import type { ContinuityViewModel } from "../../workbench/views";

export function ContinuityPanel({ continuity }: { readonly continuity: ContinuityViewModel | undefined }) {
  if (!continuity) {
    return null;
  }
  const visibleFacts = continuity.facts.slice(0, 6);
  return (
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      {continuity.tone === "warning" ? (
        <Text color="yellow" bold>{continuity.title}</Text>
      ) : (
        <Text bold>{continuity.title}</Text>
      )}
      <Text>{continuity.detail}</Text>
      {continuity.actionHint ? <Text dimColor>{continuity.actionHint}</Text> : null}
      {visibleFacts.map((fact) => <Text key={fact} dimColor>{fact}</Text>)}
      {continuity.facts.length > visibleFacts.length ? (
        <Text dimColor>{continuity.facts.length - visibleFacts.length} more retained fact(s)</Text>
      ) : null}
    </Box>
  );
}
