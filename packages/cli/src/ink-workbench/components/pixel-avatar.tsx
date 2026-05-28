import React from "react";
import { Box, Text } from "ink";
import {
  GUGA_PIXEL_AVATAR_COMPACT,
  GUGA_PIXEL_AVATAR_LARGE,
  type GugaPixelColorToken
} from "../assets/guga-pixel-avatar";

export type PixelAvatarSize = "large" | "compact";
export type PixelAvatarColorMode = "color" | "mono";

const TOKEN_COLORS: Record<Exclude<GugaPixelColorToken, "empty">, string> = {
  outline: "cyan",
  hood: "#444a68",
  shadow: "#1f2933",
  face: "#f4efe8",
  eye: "#8fc7ff",
  cheek: "#ffb3a8",
  beak: "#ffd21f",
  accent: "#ff7676",
  collar: "#d8dce8"
};

export function PixelAvatar({
  size,
  colorMode = "color"
}: {
  readonly size: PixelAvatarSize;
  readonly colorMode?: PixelAvatarColorMode;
}) {
  const avatar = size === "large" ? GUGA_PIXEL_AVATAR_LARGE : GUGA_PIXEL_AVATAR_COMPACT;
  return (
    <Box flexDirection="column">
      {avatar.map((row, index) => (
        <Text key={`${size}-${index}`}>{renderRow(row, colorMode)}</Text>
      ))}
    </Box>
  );
}

function renderRow(row: readonly GugaPixelColorToken[], colorMode: PixelAvatarColorMode): React.ReactNode {
  return row.map((token, index) => {
    if (token === "empty") {
      return <Text key={index}>  </Text>;
    }
    if (colorMode === "mono") {
      return <Text key={index}>██</Text>;
    }
    return (
      <Text key={index} color={TOKEN_COLORS[token]}>
        ██
      </Text>
    );
  });
}
