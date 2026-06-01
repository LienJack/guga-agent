import React from "react";
import { Box, Text } from "ink";
import {
  GUGA_PIXEL_AVATAR_COMPACT,
  GUGA_PIXEL_AVATAR_LARGE,
  type GugaPixelAvatar,
  type GugaPixelColor,
  type GugaPixelHexColor,
  type GugaPixelColorToken
} from "../assets/guga-pixel-avatar";

export type PixelAvatarSize = "large" | "compact";
export type PixelAvatarColorMode = "color" | "mono";
type PixelRow = readonly GugaPixelColor[];
type PixelRowPair = readonly [PixelRow, PixelRow?];

const TOKEN_COLORS: Record<Exclude<GugaPixelColorToken, "empty">, string> = {
  outline: "cyan",
  hood: "#444a68",
  shadow: "#1f2933",
  face: "#f4efe8",
  eye: "#8fc7ff",
  cheek: "#ffb3a8",
  beak: "#f59a23",
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
  const rows = colorMode === "color" ? pairRows(avatar) : avatar.map((row) => [row] as const);
  return (
    <Box flexDirection="column">
      {rows.map((rowPair, index) => (
        <Text key={`${size}-${index}`}>{renderRow(rowPair, colorMode)}</Text>
      ))}
    </Box>
  );
}

function renderRow(rowPair: PixelRowPair, colorMode: PixelAvatarColorMode): React.ReactNode {
  if (colorMode === "mono") {
    return rowPair[0].map((token, index) => (
      <Text key={index}>{token === "empty" ? " " : "█"}</Text>
    ));
  }

  const [topRow, bottomRow] = rowPair;
  return topRow.map((topToken, index) => {
    const bottomToken = bottomRow?.[index] ?? "empty";
    if (topToken === "empty" && bottomToken === "empty") {
      return <Text key={index}> </Text>;
    }
    if (topToken === "empty") {
      return (
        <Text key={index} backgroundColor={colorForVisibleToken(bottomToken)}>
          {" "}
        </Text>
      );
    }
    if (bottomToken === "empty") {
      return (
        <Text key={index} color={colorForToken(topToken)}>
          ▀
        </Text>
      );
    }
    return (
      <Text key={index} color={colorForToken(topToken)} backgroundColor={colorForToken(bottomToken)}>
        ▀
      </Text>
    );
  });
}

function colorForToken(token: Exclude<GugaPixelColor, "empty">): string {
  if (isHexColor(token)) {
    return token;
  }
  return TOKEN_COLORS[token];
}

function colorForVisibleToken(token: GugaPixelColor): string {
  if (token === "empty") {
    throw new Error("Cannot resolve color for empty avatar pixel.");
  }
  return colorForToken(token);
}

function isHexColor(token: Exclude<GugaPixelColor, "empty">): token is GugaPixelHexColor {
  return token.startsWith("#");
}

function pairRows(avatar: GugaPixelAvatar): readonly PixelRowPair[] {
  const rows: PixelRowPair[] = [];
  for (let index = 0; index < avatar.length; index += 2) {
    const topRow = avatar[index];
    const bottomRow = avatar[index + 1];
    if (!topRow) {
      continue;
    }
    rows.push(bottomRow ? [topRow, bottomRow] : [topRow]);
  }
  return rows;
}
