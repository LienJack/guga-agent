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
  | { readonly type: "text"; readonly value: string };

export interface TerminalKeypress {
  readonly name?: string;
  readonly sequence?: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
}

export function mapKeypressToIntent(key: TerminalKeypress): KeyIntent {
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

function isPrintableSequence(sequence: string | undefined): sequence is string {
  return sequence !== undefined && sequence.length > 0 && !sequence.startsWith("\u001B") && sequence >= " ";
}
