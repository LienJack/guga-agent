export type GugaPixelColorToken =
  | "empty"
  | "outline"
  | "hood"
  | "shadow"
  | "face"
  | "eye"
  | "cheek"
  | "beak"
  | "accent"
  | "collar";

export type GugaPixelAvatar = readonly (readonly GugaPixelColorToken[])[];

export const GUGA_PIXEL_AVATAR_LARGE: GugaPixelAvatar = [
  row("......OOOOOO......"),
  row("....OOHHHHHHOO...."),
  row("...OHHHHHHHHHHO..."),
  row("..OHHFFHHHHFFHHO.."),
  row(".OHHFEFHHHHFEFHHO."),
  row(".OHHFFFBBBBFFFHHO."),
  row("OHHHHHBBBBBBHHHHHO"),
  row("OHHSSSSHHHHSSSSHHO"),
  row("OHSSCCSSSSSSCCSSHO"),
  row("OHSCFFCSSSSCFFCSHO"),
  row("OHSCFECSBBSCFECSHO"),
  row("OHSSCCSSBBSSCCSSHO"),
  row(".OHHSSAABBAASSHHO."),
  row("..OHHHSSCCSSHHHO.."),
  row("...OOHHLLLLHHO...."),
  row(".....OOHHHOO......")
];

export const GUGA_PIXEL_AVATAR_COMPACT: GugaPixelAvatar = [
  row("..OOOO.."),
  row(".OHHHHO."),
  row("OHFBBFHO"),
  row("OHSSSSHO"),
  row("OSFCCFSO"),
  row("OSSBBSSO"),
  row(".OALLAO."),
  row("..OOOO..")
];

function row(pattern: string): readonly GugaPixelColorToken[] {
  return Array.from(pattern, tokenForCharacter);
}

function tokenForCharacter(character: string): GugaPixelColorToken {
  switch (character) {
    case ".":
      return "empty";
    case "O":
      return "outline";
    case "H":
      return "hood";
    case "S":
      return "shadow";
    case "F":
      return "face";
    case "E":
      return "eye";
    case "C":
      return "cheek";
    case "B":
      return "beak";
    case "A":
      return "accent";
    case "L":
      return "collar";
    default:
      throw new Error(`Unknown Guga pixel token: ${character}`);
  }
}
