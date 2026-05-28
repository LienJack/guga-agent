export type KeyIntent =
  | { readonly type: "abort" }
  | { readonly type: "backspace" }
  | { readonly type: "delete" }
  | { readonly type: "history-next" }
  | { readonly type: "history-previous" }
  | { readonly type: "left" }
  | { readonly type: "newline" }
  | { readonly type: "noop" }
  | { readonly type: "right" }
  | { readonly type: "submit" }
  | { readonly type: "paste"; readonly value: string }
  | { readonly type: "text"; readonly value: string };

export const BRACKETED_PASTE_ENABLE = "\u001B[?2004h";
export const BRACKETED_PASTE_DISABLE = "\u001B[?2004l";
export const BRACKETED_PASTE_START = "\u001B[200~";
export const BRACKETED_PASTE_END = "\u001B[201~";

export interface TerminalKeypress {
  readonly name?: string;
  readonly sequence?: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
}

export function mapKeypressToIntent(key: TerminalKeypress): KeyIntent {
  const pastePayload = parseBracketedPastePayload(key.sequence);
  if (pastePayload !== undefined) {
    return { type: "paste", value: pastePayload };
  }

  if (key.name === "c" && key.ctrl === true) {
    return { type: "abort" };
  }

  if (key.name === "escape" || key.sequence === "\u001B") {
    return { type: "abort" };
  }

  if (key.name === "return" || key.name === "enter" || key.sequence === "\r") {
    if (key.shift === true || key.meta === true) {
      return { type: "newline" };
    }

    return { type: "submit" };
  }

  if (key.name === "backspace") {
    return { type: "backspace" };
  }

  if (key.name === "delete") {
    return { type: "delete" };
  }

  if (key.name === "left") {
    return { type: "left" };
  }

  if (key.name === "right") {
    return { type: "right" };
  }

  if (key.name === "up") {
    return { type: "history-previous" };
  }

  if (key.name === "down") {
    return { type: "history-next" };
  }

  if (isPrintableSequence(key.sequence)) {
    return { type: "text", value: key.sequence };
  }

  return { type: "noop" };
}

export function parseBracketedPastePayload(sequence: string | undefined): string | undefined {
  if (sequence === undefined) {
    return undefined;
  }

  if (!sequence.startsWith(BRACKETED_PASTE_START) || !sequence.endsWith(BRACKETED_PASTE_END)) {
    return undefined;
  }

  return sequence.slice(BRACKETED_PASTE_START.length, sequence.length - BRACKETED_PASTE_END.length);
}

function isPrintableSequence(sequence: string | undefined): sequence is string {
  return sequence !== undefined && sequence.length > 0 && !sequence.startsWith("\u001B") && sequence >= " ";
}
