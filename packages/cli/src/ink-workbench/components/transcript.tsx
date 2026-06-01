import React from "react";
import { Box, Text } from "ink";
import type { TranscriptViewBlock } from "../../workbench/views";

export function Transcript({ blocks }: { readonly blocks: readonly TranscriptViewBlock[] }) {
  const visible = blocks.slice(-12);
  return (
    <Box flexDirection="column" minHeight={3}>
      {visible.length === 0 ? (
        <Text dimColor>No transcript yet.</Text>
      ) : visible.map((block) => (
        <Box key={block.id} flexDirection="column">
          <Text bold>{block.title}</Text>
          {block.detail.length > 0 ? <Text>{block.detail}</Text> : null}
        </Box>
      ))}
    </Box>
  );
}
