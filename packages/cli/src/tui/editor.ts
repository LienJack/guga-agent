import type { KeyIntent } from "./keys";

export interface EditorState {
  readonly text: string;
  readonly cursor: number;
  readonly history: readonly string[];
  readonly historyIndex: number | null;
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
    case "newline":
      return { state: insertText(state, "\n") };
    case "backspace":
      return { state: backspace(state) };
    case "delete":
      return { state: deleteForward(state) };
    case "left":
      return { state: { ...state, cursor: Math.max(0, state.cursor - 1) } };
    case "right":
      return { state: { ...state, cursor: Math.min(state.text.length, state.cursor + 1) } };
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

  return {
    ...state,
    text: `${state.text.slice(0, state.cursor - 1)}${state.text.slice(state.cursor)}`,
    cursor: state.cursor - 1,
    historyIndex: null
  };
}

function deleteForward(state: EditorState): EditorState {
  if (state.cursor >= state.text.length) {
    return state;
  }

  return {
    ...state,
    text: `${state.text.slice(0, state.cursor)}${state.text.slice(state.cursor + 1)}`,
    historyIndex: null
  };
}

function moveHistory(state: EditorState, direction: -1 | 1): EditorState {
  if (state.history.length === 0) {
    return state;
  }

  const current = state.historyIndex ?? state.history.length;
  const next = Math.min(state.history.length, Math.max(0, current + direction));

  if (next === state.history.length) {
    return { ...state, text: "", cursor: 0, historyIndex: null };
  }

  const text = state.history[next];
  if (text === undefined) {
    return state;
  }

  return {
    ...state,
    text,
    cursor: text.length,
    historyIndex: next
  };
}
