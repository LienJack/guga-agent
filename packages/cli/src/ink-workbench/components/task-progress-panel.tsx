import React from "react";
import { Box, Text } from "ink";
import type { TaskProgressViewModel } from "../../workbench/views";

export function TaskProgressPanel({ task }: { readonly task: TaskProgressViewModel | undefined }) {
  if (!task) {
    return null;
  }
  const visibleItems = task.items.slice(0, 6);
  return (
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      <Text bold>{task.title} | {task.progressLabel}</Text>
      <Text>{task.objective}</Text>
      <Text dimColor>
        {task.phaseLabel}
        {task.currentItemLabel ? ` | ${task.currentItemLabel}` : ""}
        {task.verificationLabel ? ` | verify ${task.verificationLabel}` : ""}
      </Text>
      <Text dimColor>{task.completionLabel}</Text>
      {task.blockedReason ? <Text color="yellow">Blocked: {task.blockedReason}</Text> : null}
      {visibleItems.map((item) => (
        <Box key={item.id} flexDirection="column">
          {item.isBlocked ? (
            <Text color="yellow" bold={item.isCurrent}>
              {item.isCurrent ? "> " : "  "}{item.id} {item.status} - {item.title}
            </Text>
          ) : (
            <Text bold={item.isCurrent}>
              {item.isCurrent ? "> " : "  "}{item.id} {item.status} - {item.title}
            </Text>
          )}
          {item.detail.length > 0 ? <Text dimColor>{item.detail}</Text> : null}
        </Box>
      ))}
      {task.items.length > visibleItems.length ? (
        <Text dimColor>{task.items.length - visibleItems.length} more plan item(s)</Text>
      ) : null}
    </Box>
  );
}
