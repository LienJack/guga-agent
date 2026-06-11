import React from "react";
import { Box, Text } from "ink";
import type { PlatformPanelRowViewModel, PlatformPanelViewModel } from "../../workbench/views";

export function PlatformPanel({ panel }: { readonly panel: PlatformPanelViewModel | undefined }) {
  if (!panel) {
    return null;
  }
  const visibleRows = panel.rows.slice(0, 10);
  return (
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      <Text bold>{panel.title}{panel.subtitle ? ` | ${panel.subtitle}` : ""}</Text>
      {panel.emptyLabel ? <Text dimColor>{panel.emptyLabel}</Text> : null}
      {visibleRows.map((row) => (
        <Box key={`${row.label}:${row.value}`} flexDirection="column">
          <PlatformPanelRow row={row} />
          {row.detail ? <Text dimColor>{row.detail}</Text> : null}
        </Box>
      ))}
      {panel.rows.length > visibleRows.length ? (
        <Text dimColor>{panel.rows.length - visibleRows.length} more row(s)</Text>
      ) : null}
    </Box>
  );
}

function PlatformPanelRow({ row }: { readonly row: PlatformPanelRowViewModel }) {
  const content = `${row.label}: ${row.value}`;
  if (row.tone === "danger") {
    return <Text color="red">{content}</Text>;
  }
  if (row.tone === "warning") {
    return <Text color="yellow">{content}</Text>;
  }
  if (row.tone === "muted") {
    return <Text dimColor>{content}</Text>;
  }
  return <Text>{content}</Text>;
}
