import type { KeyIntent } from "./keys";

export interface EditorState {
  readonly text: string;
  readonly cursor: number;
  readonly history: readonly string[];
  readonly historyIndex: number | null;
  readonly historyDraft?: string;
}

export type EditorActionResult =
  | { readonly state: EditorState; readonly submitText?: never }
  | { readonly state: EditorState; readonly submitText: string };

export function createEditorState(options: {
  readonly text?: string;
  readonly history?: readonly string[];
} = {}): EditorState {
  const text = options.text ?? "";

  return {
    text,
    cursor: text.length,
    history: options.history ?? [],
    historyIndex: null
  };
}

export function applyEditorIntent(state: EditorState, intent: KeyIntent): EditorActionResult {
  switch (intent.type) {
    case "text":
      return { state: insertText(state, intent.value) };
    case "paste":
      return { state: insertText(state, intent.value) };
    case "complete":
      return { state };
    case "newline":
      return { state: insertText(state, "\n") };
    case "backspace":
      return { state: backspace(state) };
    case "delete":
      return { state: deleteForward(state) };
    case "left":
      return { state: { ...state, cursor: previousCursorPosition(state.text, state.cursor) } };
    case "right":
      return { state: { ...state, cursor: nextCursorPosition(state.text, state.cursor) } };
    case "history-previous":
      return { state: moveHistory(state, -1) };
    case "history-next":
      return { state: moveHistory(state, 1) };
    case "submit": {
      const submitText = state.text;
      const history = submitText.trim() === "" ? state.history : [...state.history, submitText];
      return { state: createEditorState({ history }), submitText };
    }
    case "abort":
    case "noop":
      return { state };
  }
}

function insertText(state: EditorState, value: string): EditorState {
  return {
    ...state,
    text: `${state.text.slice(0, state.cursor)}${value}${state.text.slice(state.cursor)}`,
    cursor: state.cursor + value.length,
    historyIndex: null
  };
}

function backspace(state: EditorState): EditorState {
  if (state.cursor === 0) {
    return state;
  }

  const previousCursor = previousCursorPosition(state.text, state.cursor);
  return {
    ...state,
    text: `${state.text.slice(0, previousCursor)}${state.text.slice(state.cursor)}`,
    cursor: previousCursor,
    historyIndex: null
  };
}

function deleteForward(state: EditorState): EditorState {
  if (state.cursor >= state.text.length) {
    return state;
  }

  const nextCursor = nextCursorPosition(state.text, state.cursor);
  return {
    ...state,
    text: `${state.text.slice(0, state.cursor)}${state.text.slice(nextCursor)}`,
    historyIndex: null
  };
}

function moveHistory(state: EditorState, direction: -1 | 1): EditorState {
  if (state.history.length === 0) {
    return state;
  }

  const current = state.historyIndex ?? state.history.length;
  const next = Math.min(state.history.length, Math.max(0, current + direction));
  const historyDraft = state.historyIndex === null ? state.text : state.historyDraft;

  if (next === state.history.length) {
    return withoutHistoryDraft({
      ...state,
      text: historyDraft ?? "",
      cursor: (historyDraft ?? "").length,
      historyIndex: null
    });
  }

  const text = state.history[next];
  if (text === undefined) {
    return state;
  }

  return {
    ...state,
    text,
    cursor: text.length,
    historyIndex: next,
    ...(historyDraft !== undefined ? { historyDraft } : {})
  };
}

function previousCursorPosition(text: string, cursor: number): number {
  if (cursor <= 0) {
    return 0;
  }

  let previous = 0;
  for (const character of text) {
    const next = previous + character.length;
    if (next >= cursor) {
      return previous;
    }
    previous = next;
  }
  return Math.max(0, cursor - 1);
}

function nextCursorPosition(text: string, cursor: number): number {
  if (cursor >= text.length) {
    return text.length;
  }

  for (let index = 0; index < text.length;) {
    const character = Array.from(text.slice(index))[0];
    if (character === undefined) {
      return text.length;
    }
    const next = index + character.length;
    if (index >= cursor) {
      return next;
    }
    if (next > cursor) {
      return next;
    }
    index = next;
  }
  return text.length;
}

function withoutHistoryDraft(state: EditorState): EditorState {
  const { historyDraft: _historyDraft, ...rest } = state;
  return rest;
}
