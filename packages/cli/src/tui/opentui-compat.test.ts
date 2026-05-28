import { describe, expect, it } from "vitest";
import { applyEditorIntent, createEditorState } from "./editor";
import {
  BRACKETED_PASTE_DISABLE,
  BRACKETED_PASTE_ENABLE,
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  mapKeypressToIntent
} from "./keys";
import { renderOverlayLines } from "./overlay";
import {
  createFallbackTerminalAdapter,
  renderTerminalFrame,
  TUI_RUNTIME_DECISION
} from "./terminal";

describe("TUI runtime compatibility", () => {
  it("records the current runtime path as the deterministic fallback renderer", () => {
    expect(TUI_RUNTIME_DECISION).toBe("minimal-fallback-renderer");
  });

  it("renders deterministic frames without importing OpenTUI", () => {
    expect(renderTerminalFrame({
      title: "Guga",
      lines: ["assistant: ready"],
      status: "model mock"
    })).toEqual({
      output: "Guga\nassistant: ready\nmodel mock\n",
      lineCount: 3
    });
  });

  it("defines non-TTY fallback guidance for headless usage", () => {
    const terminal = createFallbackTerminalAdapter({ isTTY: false });

    expect(terminal.isInteractive).toBe(false);
    expect(terminal.nonTtyMessage("guga")).toBe(
      'guga interactive workbench requires a TTY. Use guga run "<prompt>" or guga -p "<prompt>" for headless runs.'
    );
  });

  it("maps workbench control keys without renderer-specific types", () => {
    expect(mapKeypressToIntent({ name: "c", ctrl: true })).toEqual({ type: "abort" });
    expect(mapKeypressToIntent({ name: "escape" })).toEqual({ type: "abort" });
    expect(mapKeypressToIntent({ name: "return" })).toEqual({ type: "submit" });
    expect(mapKeypressToIntent({ name: "return", shift: true })).toEqual({ type: "newline" });
    expect(mapKeypressToIntent({ sequence: "x" })).toEqual({ type: "text", value: "x" });
  });

  it("maps bracketed paste as a single text payload intent", () => {
    expect(BRACKETED_PASTE_ENABLE).toBe("\u001B[?2004h");
    expect(BRACKETED_PASTE_DISABLE).toBe("\u001B[?2004l");
    expect(mapKeypressToIntent({
      sequence: `${BRACKETED_PASTE_START}first\nsecond${BRACKETED_PASTE_END}`
    })).toEqual({ type: "paste", value: "first\nsecond" });
  });

  it("keeps prompt editing deterministic for fallback tests", () => {
    let result = applyEditorIntent(createEditorState(), { type: "text", value: "hello" });
    result = applyEditorIntent(result.state, { type: "newline" });
    result = applyEditorIntent(result.state, { type: "text", value: "world" });
    result = applyEditorIntent(result.state, { type: "submit" });

    expect(result.submitText).toBe("hello\nworld");
    expect(result.state).toEqual({
      text: "",
      cursor: 0,
      history: ["hello\nworld"],
      historyIndex: null
    });
  });

  it("renders overlays as plain terminal lines", () => {
    expect(renderOverlayLines({
      kind: "permission",
      title: "Permission",
      body: ["shell wants to run: pnpm test"],
      actions: ["allow", "deny"]
    }, 36)).toEqual([
      "+----------------------------------+",
      "| Permission                       |",
      "| shell wants to run: pnpm test    |",
      "|                                  |",
      "| allow  deny                      |",
      "+----------------------------------+"
    ]);
  });
});
