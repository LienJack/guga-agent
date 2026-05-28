import { describe, expect, it } from "vitest";
import { applyEditorIntent, createEditorState } from "../tui/editor";
import { BRACKETED_PASTE_END, BRACKETED_PASTE_START, mapKeypressToIntent } from "../tui/keys";
import {
  applyPromptIntent,
  createPromptState,
  setPromptInputTarget
} from "./prompt-state";

describe("prompt state", () => {
  it("inserts printable text at the cursor, submits, and resets the editor", () => {
    let result = applyPromptIntent(createPromptState(), { type: "text", value: "hello" });
    result = applyPromptIntent(result.state, { type: "left" });
    result = applyPromptIntent(result.state, { type: "text", value: "!" });
    result = applyPromptIntent(result.state, { type: "submit" });

    expect(result.effect).toEqual({ type: "submit-prompt", text: "hell!o" });
    expect(result.state.editor).toMatchObject({
      text: "",
      cursor: 0,
      history: ["hell!o"],
      historyIndex: null
    });
  });

  it("distinguishes newline insertion from plain enter submit", () => {
    let result = applyPromptIntent(createPromptState(), { type: "text", value: "hello" });
    result = applyPromptIntent(result.state, { type: "newline" });
    result = applyPromptIntent(result.state, { type: "text", value: "world" });
    result = applyPromptIntent(result.state, { type: "submit" });

    expect(result.effect).toEqual({ type: "submit-prompt", text: "hello\nworld" });
  });

  it("restores the draft after browsing multiline history", () => {
    let result = applyPromptIntent(createPromptState({ history: ["one", "two\nlines"] }), {
      type: "text",
      value: "draft\nnow"
    });

    result = applyPromptIntent(result.state, { type: "history-previous" });
    expect(result.state.editor.text).toBe("two\nlines");

    result = applyPromptIntent(result.state, { type: "history-next" });
    expect(result.state.editor.text).toBe("draft\nnow");
    expect(result.state.editor.cursor).toBe("draft\nnow".length);
  });

  it("keeps multiline cursor operations stable across insert, backspace, delete, left, and right", () => {
    let editor = createEditorState({ text: "ab\ncd" });
    editor = applyEditorIntent(editor, { type: "left" }).state;
    editor = applyEditorIntent(editor, { type: "left" }).state;
    editor = applyEditorIntent(editor, { type: "text", value: "X" }).state;
    expect(editor.text).toBe("ab\nXcd");

    editor = applyEditorIntent(editor, { type: "backspace" }).state;
    expect(editor.text).toBe("ab\ncd");

    editor = applyEditorIntent(editor, { type: "delete" }).state;
    expect(editor.text).toBe("ab\nd");

    editor = applyEditorIntent(editor, { type: "right" }).state;
    expect(editor.cursor).toBe("ab\nd".length);
  });

  it("treats bracketed paste payloads as one multiline editor input", () => {
    const paste = mapKeypressToIntent({
      sequence: `${BRACKETED_PASTE_START}first\nsecond${BRACKETED_PASTE_END}`
    });

    let result = applyPromptIntent(createPromptState({ history: ["old"] }), paste);
    result = applyPromptIntent(result.state, { type: "text", value: "!" });

    expect(result.state.editor.text).toBe("first\nsecond!");
    expect(result.state.editor.history).toEqual(["old"]);
    expect(result.effect).toBeUndefined();
  });

  it("keeps non-ASCII and wide-character smoke input intact", () => {
    let result = applyPromptIntent(createPromptState(), { type: "text", value: "你好🙂" });
    result = applyPromptIntent(result.state, { type: "left" });
    result = applyPromptIntent(result.state, { type: "backspace" });
    result = applyPromptIntent(result.state, { type: "text", value: "界" });

    expect(result.state.editor.text).toBe("你界🙂");
  });

  it("routes active-run and prompt responses through explicit submit effects", () => {
    let state = setPromptInputTarget(createPromptState({ text: "next" }), { kind: "run-input", mode: "follow_up" });
    expect(applyPromptIntent(state, { type: "submit" }).effect).toEqual({
      type: "submit-run-input",
      mode: "follow_up",
      text: "next"
    });

    state = setPromptInputTarget(createPromptState({ text: "allow" }), {
      kind: "permission-response",
      requestId: "permission-1"
    });
    expect(applyPromptIntent(state, { type: "submit" }).effect).toEqual({
      type: "submit-permission-response",
      requestId: "permission-1",
      text: "allow"
    });
  });

  it("turns escape into an abort intent without mutating host state", () => {
    const result = applyPromptIntent(createPromptState({ text: "draft" }), { type: "abort" });

    expect(result.effect).toEqual({ type: "abort" });
    expect(result.state.editor.text).toBe("draft");
  });

  it("opens slash state before slash-prefixed text can submit as a normal prompt", () => {
    let result = applyPromptIntent(createPromptState(), { type: "text", value: "/" });
    expect(result.effect).toEqual({ type: "open-slash", query: "" });

    result = applyPromptIntent(result.state, { type: "text", value: "model" });
    expect(result.effect).toEqual({ type: "open-slash", query: "model" });

    result = applyPromptIntent(result.state, { type: "submit" });
    expect(result.effect).toEqual({ type: "open-slash", query: "model" });

    result = applyPromptIntent(result.state, { type: "submit" }, { slashPaletteOpen: true });
    expect(result.effect).toEqual({ type: "submit-slash", text: "/model" });
  });
});
