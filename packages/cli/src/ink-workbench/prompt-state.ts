import { applyEditorIntent, createEditorState, type EditorState } from "../tui/editor";
import type { KeyIntent } from "../tui/keys";

export type PromptInputTarget =
  | { readonly kind: "prompt" }
  | { readonly kind: "run-input"; readonly mode: "steer" | "follow_up" }
  | { readonly kind: "permission-response"; readonly requestId: string }
  | { readonly kind: "interaction-response"; readonly requestId: string };

export interface PromptState {
  readonly editor: EditorState;
  readonly target: PromptInputTarget;
}

export type PromptEffect =
  | { readonly type: "abort" }
  | { readonly type: "close-slash" }
  | { readonly type: "open-slash"; readonly query: string }
  | { readonly type: "submit-interaction-response"; readonly requestId: string; readonly text: string }
  | { readonly type: "submit-permission-response"; readonly requestId: string; readonly text: string }
  | { readonly type: "submit-prompt"; readonly text: string }
  | { readonly type: "submit-run-input"; readonly mode: "steer" | "follow_up"; readonly text: string }
  | { readonly type: "submit-slash"; readonly text: string };

export interface PromptActionResult {
  readonly state: PromptState;
  readonly effect?: PromptEffect;
}

export interface PromptApplyOptions {
  readonly slashPaletteOpen?: boolean;
}

export function createPromptState(options: {
  readonly text?: string;
  readonly history?: readonly string[];
  readonly target?: PromptInputTarget;
} = {}): PromptState {
  const editorOptions: { text?: string; history?: readonly string[] } = {};
  if (options.text !== undefined) {
    editorOptions.text = options.text;
  }
  if (options.history !== undefined) {
    editorOptions.history = options.history;
  }

  return {
    editor: createEditorState(editorOptions),
    target: options.target ?? { kind: "prompt" }
  };
}

export function applyPromptIntent(
  state: PromptState,
  keyIntent: KeyIntent,
  options: PromptApplyOptions = {}
): PromptActionResult {
  if (keyIntent.type === "abort") {
    return withEffect(state, { type: "abort" });
  }

  if (keyIntent.type === "submit") {
    return submitPrompt(state, options);
  }

  const editorResult = applyEditorIntent(state.editor, keyIntent);
  const nextState = { ...state, editor: editorResult.state };
  const slashEffect = slashEffectForEdit(state.editor.text, editorResult.state.text, state.target);
  return slashEffect ? withEffect(nextState, slashEffect) : { state: nextState };
}

export function setPromptInputTarget(state: PromptState, target: PromptInputTarget): PromptState {
  return { ...state, target };
}

export function getPromptText(state: PromptState): string {
  return state.editor.text;
}

function submitPrompt(state: PromptState, options: PromptApplyOptions): PromptActionResult {
  const text = state.editor.text;
  const slashQuery = slashQueryForText(text);
  if (state.target.kind === "prompt" && slashQuery !== null) {
    if (options.slashPaletteOpen === true) {
      return submitWithReset(state, { type: "submit-slash", text });
    }
    return withEffect(state, { type: "open-slash", query: slashQuery });
  }

  switch (state.target.kind) {
    case "prompt":
      return submitWithReset(state, { type: "submit-prompt", text });
    case "run-input":
      return submitWithReset(state, { type: "submit-run-input", mode: state.target.mode, text });
    case "permission-response":
      return submitWithReset(state, {
        type: "submit-permission-response",
        requestId: state.target.requestId,
        text
      });
    case "interaction-response":
      return submitWithReset(state, {
        type: "submit-interaction-response",
        requestId: state.target.requestId,
        text
      });
  }
}

function submitWithReset(state: PromptState, effect: PromptEffect): PromptActionResult {
  const editorResult = applyEditorIntent(state.editor, { type: "submit" });
  return withEffect({ ...state, editor: editorResult.state }, effect);
}

function slashEffectForEdit(
  previousText: string,
  nextText: string,
  target: PromptInputTarget
): PromptEffect | undefined {
  if (target.kind !== "prompt") {
    return undefined;
  }

  const previousQuery = slashQueryForText(previousText);
  const nextQuery = slashQueryForText(nextText);
  if (nextQuery !== null) {
    return { type: "open-slash", query: nextQuery };
  }
  if (previousQuery !== null) {
    return { type: "close-slash" };
  }
  return undefined;
}

function slashQueryForText(text: string): string | null {
  const trimmedStart = text.trimStart();
  return trimmedStart.startsWith("/") ? trimmedStart.slice(1) : null;
}

function withEffect(state: PromptState, effect: PromptEffect): PromptActionResult {
  return { state, effect };
}
