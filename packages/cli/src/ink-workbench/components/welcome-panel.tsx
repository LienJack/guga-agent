import React from "react";
import { Box, Text } from "ink";
import type { WelcomeViewModel } from "../../workbench/views";
import { PixelAvatar, type PixelAvatarColorMode, type PixelAvatarSize } from "./pixel-avatar";

export function WelcomePanel({
  welcome,
  columns,
  colorMode = "color"
}: {
  readonly welcome: WelcomeViewModel;
  readonly columns: number;
  readonly colorMode?: PixelAvatarColorMode;
}) {
  if (!welcome.visible) {
    return null;
  }

  const compact = columns < 88;
  const avatarSize: PixelAvatarSize = compact ? "compact" : "large";
  const facts = [
    `model ${welcome.modelLabel}`,
    welcome.contextLabel,
    welcome.costLabel,
    welcome.cwdLabel
  ];

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} flexDirection={compact ? "column" : "row"}>
      <Box flexDirection="column" alignItems="center" marginRight={compact ? 0 : 2}>
        <Text bold>{welcome.title}</Text>
        <PixelAvatar size={avatarSize} colorMode={colorMode} />
        {facts.map((fact) => <Text key={fact} dimColor>{fact}</Text>)}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="yellow">Tips</Text>
        {welcome.tips.map((tip) => <Text key={tip}>- {tip}</Text>)}
        <Text bold color="yellow">What's new</Text>
        {welcome.whatsNew.map((item) => <Text key={item}>- {item}</Text>)}
        <Text dimColor>{welcome.commandLabel}</Text>
      </Box>
    </Box>
  );
}
