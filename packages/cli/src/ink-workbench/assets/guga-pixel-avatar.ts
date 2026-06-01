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

export type GugaPixelHexColor = `#${string}`;
export type GugaPixelColor = GugaPixelColorToken | GugaPixelHexColor;
export type GugaPixelAvatar = readonly (readonly GugaPixelColor[])[];

export const GUGA_PIXEL_AVATAR_LARGE: GugaPixelAvatar = [
  hexRow(".. .. .. .. .. .. .. .. .. .. .. .. .. #00bfbf #00bfdf #00bfdf #00bfdf #00bfdf #00bfff .. .. .. .. .. .. .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. .. .. .. .. #15aabf #13a4cf #1386aa #137b9c #127b9c #137d9c #127b9c #1485a7 #17a2cc #12a4c8 .. .. .. .. .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. .. .. #0eb8e3 #13bfec #18addc #13617c #174258 #1d3248 #1d3248 #1d3248 #1d3147 #183f56 #125d76 #1387a9 #17b0dd #0dc9ff .. .. .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. .. #00b1eb #16aedb #1bb1df #275c81 #28334e #2d304c #323553 #323453 #313452 #313453 #2e314d #242d46 #173347 #11637f #1081a0 #00b1eb .. .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. #10afdf #1291b6 #204763 #2e3755 #6d6e84 #8c8d9e #353857 #323554 #323554 #323553 #323554 #353856 #838496 #6d6f83 #293049 #1c3c54 #1391b5 #0fb4e1 .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. #009fdf #158bb0 #15465e #2a2c46 #66677d #7b7b7b #585859 #8d8e9f #303351 #2f324e #2f324f #303352 #828497 #656566 #737373 #696b80 #2c2f4a #143f53 #1385aa #008bb9 .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. #1290b7 #154e66 #292c45 #343755 #adaeb7 #505050 #8f8e92 #737588 #3c393a #594c27 #5a4e27 #3d3a37 #6b6d82 #8f8e92 #515151 #b7b7c0 #343655 #2a2d47 #16475f #1389ae .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. #0c97c5 #157da1 #1f3249 #313452 #323553 #494b66 #797a8b #717386 #393940 #91781e #e0b51d #e2b81e #997e1e #36353d #6b6d81 #787a8b #4b4e69 #323453 #313453 #21354d #157799 #108cad .. .. .. .. .."),
  hexRow(".. .. .. .. .. #169fc6 #156481 #212339 #23263c #2e314e #323553 #2f324c #1f2130 #574812 #cca319 #f6bf1c #f8c01d #d0a71b #5e5013 #1c1d2b #2c2f49 #333654 #323554 #313553 #282b44 #17617c #1495b9 .. .. .. .. .."),
  hexRow(".. .. .. .. .. #17a8d4 #0f111b #184962 #137494 #233853 #2c2f4a #08080e #050505 #101010 #271a06 #563602 #583702 #291b04 #101010 #070707 #08080d #2d2f4b #323553 #323554 #313453 #161826 #199dc6 .. .. .. .. .."),
  hexRow(".. .. .. .. #19bdef #1583a5 #151725 #174b63 #148eb3 #193b52 #06070a #040404 #141313 #191919 #181717 #171717 #171717 #171717 #1a1a1a #141414 #050505 #040407 #282a42 #313452 #323553 #1d1e30 #157b9b #16b4e1 .. .. .. .."),
  hexRow(".. .. .. .. #19bdef #0a222d #28304a #143c50 #0b566d #0d586e #020708 #131312 #161615 #222229 #232326 #1a1a1a #1a1a1a #181817 #1a1a19 #191918 #111111 #070707 #0e0f15 #25283f #313352 #303350 #0b212c #17b3e4 .. .. .. .."),
  hexRow(".. .. .. #14baeb #1082a4 #192436 #202a40 #093b4a #062d39 #0a4859 #0c4f62 #1d1c1b #464340 #252530 #24242a #191919 #191919 #121212 #191919 #161615 #131313 #151515 #111111 #0e0f17 #262840 #313452 #192537 #107e9d #15bfea .. .. .."),
  hexRow(".. .. .. #16b9e5 #0c5970 #2a2e48 #262840 #0b181f #106782 #0a4a5e #1488ab #465354 #807972 #0d0d0e #111112 #181818 #1a1a1a #1e1e1d #181818 #3b3a37 #44423f #171717 #191918 #101011 #11111a #282b44 #2a2e48 #0b556c #19bff5 .. .. .."),
  hexRow(".. .. .. #1ab7e6 #0c566d #262940 #171822 #161c1e #155365 #0c3743 #031115 #387281 #665f5a #3d3a37 #1b1a1a #222121 #292827 #817971 #514c48 #4e4c49 #8d857f #232120 #191919 #1a1a1a #0e0e0e #11111b #262840 #0b546a #18c2f6 .. .. .."),
  hexRow(".. .. .. #18b2e7 #106a85 #0c121a #0f0f0f #191919 #161515 #0c0c0c #433f3b #8e867e #b2a89d #b6aca1 #c2b8ad #c6bbb0 #c7bcb1 #e4d7c9 #c2b7ab #888179 #aba197 #b4aba0 #131212 #1a1a1a #181818 #0d0d0d #0b1119 #0e6681 #14bcf2 .. .. .."),
  hexRow(".. .. .. #14b1d8 #149bc2 #09181c #191918 #181818 #181717 #0c0c0c #55514c #313131 #191b1e #4f4d4c #d8cdc2 #fceddd #fcecde #e6d8cb #65615b #1a1c1f #333334 #69635d #0c0c0c #1a1a1a #181818 #181818 #08171b #1596bc #15aad4 .. .. .."),
  hexRow(".. .. .. #19b2e0 #0d607a #141717 #1a1a19 #131312 #111111 #0c0c0b #69645f #a6adb6 #1e334d #182639 #bcbaba #fcecdd #fcecdd #e1d7d0 #535961 #2d3e52 #b7bcc2 #615c58 #0b0b0b #1a1a1a #121212 #161616 #131717 #0e5e77 #17bbee .. .. .."),
  hexRow(".. .. .. #1ab7e6 #0b566d #131313 #0e0e0e #111111 #0f0f0f #0f0e0e #e5d9cd #9fafc5 #0a3266 #1f406a #bfbdc0 #fcecdd #fcecdd #cbc8c7 #23446d #37577e #dde3e9 #f4e6d9 #0f0f0f #191919 #101010 #0b0b0b #131313 #0c5369 #18c2f6 .. .. .."),
  hexRow(".. .. .. #1ab7ea #0b566d #122f38 #0a0a0a #111111 #0f0f0f #0f0e0e #e3d4c6 #ebded8 #6a819f #9fa7b3 #fbebdd #fce8d9 #fce7d9 #fbecdd #aaafb7 #647c9b #e3d9d5 #f3e4d5 #0f0f0f #111111 #070707 #070707 #122a32 #0c5369 #1cc2f6 .. .. .."),
  hexRow(".. .. .. #17b4e8 #0e6884 #137998 #0c272f #0f0f0f #0f0f0f #10100f #766a64 #fcc7ba #fce6d7 #fcecdd #fce9db #fca99d #fca599 #fceadb #fcecde #fce3d5 #fcc8ba #7b6f69 #101010 #111111 #080707 #0a232a #117594 #0e6580 #1ac4f8 .. .. .."),
  hexRow(".. .. .. #00b6db #118fb8 #158aad #126984 #0b0c0c #090909 #141414 #0f0d0b #ab9389 #fbe9da #fcecdd #fce8d9 #fc7a6f #fc7369 #fce9d9 #fcecde #fbe8d9 #b0988e #0d0a0a #141414 #0a0a0a #080909 #116179 #148aac #118fb4 #00d4ff .. .. .."),
  hexRow(".. .. .. .. .. #1bbeef #1584a5 #115e77 #0c3c4b #121212 #050505 #3f3d3b #b1a79d #d0c5b9 #d0c3b8 #d0aca1 #d1aba0 #d0c3b8 #d0c5b9 #b6aca2 #474442 #040404 #131313 #0a3441 #0f6680 #13809f #19b9eb .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. #1199bb #1394b9 #0f6a86 #091b21 #101010 #7e7d7e #5d5c5d #7c7c7c #3f3e3e #797878 #636362 #434343 #7a7979 #676667 #7d7c7e #111111 #08161b #0c6884 #138bb1 #0d80a6 .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. .. #17aedc #18a3cd #072d38 #304850 #8e7273 #d37473 #856b72 #29292a #414042 #816971 #e17974 #987373 #354c52 #062630 #19a1c9 #1ab1db .. .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. .. .. #17d1ff #15a5d0 #19a2ca #29aad1 #35a8cd #85a5b2 #353435 #4e4e4e #92b3c0 #3db3de #2eb4dc #1ba5cd #16a2ce #11aacc .. .. .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. .. .. .. .. #1abfe6 #1bc5f4 #1dbff3 #71b3d0 #828282 #888888 #74c5dc #1dc5ff #1bc3f4 #17b9e8 .. .. .. .. .. .. .. .. .. .. .."),
  hexRow(".. .. .. .. .. .. .. .. .. .. .. .. .. .. .. #d4d4d4 #cccccc .. .. .. .. .. .. .. .. .. .. .. .. .. .. ..")
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

function hexRow(pattern: string): readonly GugaPixelColor[] {
  return pattern.split(" ").map((value): GugaPixelColor => {
    if (value === "..") {
      return "empty";
    }
    return value as GugaPixelHexColor;
  });
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
