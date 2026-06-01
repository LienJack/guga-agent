export type ThemeTone = "accent" | "danger" | "muted" | "success" | "warning";

export interface TerminalTheme {
  readonly colors: boolean;
}

export const fallbackTheme: TerminalTheme = {
  colors: false
};

export function applyTone(text: string, _tone: ThemeTone, theme: TerminalTheme = fallbackTheme): string {
  if (!theme.colors) {
    return text;
  }

  return text;
}
