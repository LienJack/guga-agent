import { describe, expect, it } from "vitest";
import {
  applySelectorIntent,
  confirmSelectorOption,
  createCommandSelectorOptions,
  createSelectorState,
  getHighlightedSelectorOption,
  getVisibleSelectorOptions,
  moveSelectorHighlight,
  updateSelectorQuery
} from "./selector-state";

describe("selector state", () => {
  it("filters selector options by label, value, detail, and keywords", () => {
    const state = updateSelectorQuery(selector(), "cheap");

    expect(getVisibleSelectorOptions(state).map((option) => option.id)).toEqual(["fast"]);
    expect(getHighlightedSelectorOption(state)?.id).toBe("fast");
  });

  it("moves highlighted options with keyboard navigation and skips disabled entries", () => {
    let state = createSelectorState({
      source: "custom",
      title: "Pick",
      options: [
        { id: "a", label: "A", value: "a" },
        { id: "b", label: "B", value: "b", disabled: true },
        { id: "c", label: "C", value: "c" }
      ]
    });

    state = moveSelectorHighlight(state, 1);
    expect(getHighlightedSelectorOption(state)?.id).toBe("c");

    state = applySelectorIntent(state, { type: "history-previous" }).state;
    expect(getHighlightedSelectorOption(state)?.id).toBe("a");
  });

  it("creates /model selector options that submit equivalent slash command text", () => {
    const state = createSelectorState({
      source: "model",
      title: "Model",
      options: createCommandSelectorOptions("/model", [
        { id: "fast", label: "fast", value: "fast", detail: "gpt-fast" },
        { id: "slow", label: "slow", value: "slow", detail: "gpt-slow" }
      ])
    });

    const result = confirmSelectorOption(state);

    expect(result.effect).toMatchObject({
      type: "select",
      commandText: "/model fast",
      option: {
        id: "fast",
        value: "fast"
      }
    });
  });

  it("creates /profile selector options while preserving new-session command semantics", () => {
    const state = createSelectorState({
      source: "profile",
      title: "Profile",
      options: createCommandSelectorOptions("/profile", [
        { id: "code", label: "Code", value: "code", detail: "new session required" }
      ])
    });

    expect(confirmSelectorOption(state).effect).toMatchObject({
      type: "select",
      commandText: "/profile code",
      option: {
        detail: "new session required"
      }
    });
  });

  it("creates /resume selector options from session resource choices", () => {
    const state = createSelectorState({
      source: "resume",
      title: "Resume",
      options: createCommandSelectorOptions("/resume", [
        {
          id: "session-1:main",
          label: "session-1",
          value: "session-1 main",
          detail: "main branch",
          keywords: ["recent"]
        }
      ])
    });

    expect(confirmSelectorOption(state).effect).toMatchObject({
      type: "select",
      commandText: "/resume session-1 main"
    });
  });

  it("closes on escape and keeps typed filtering local to selector state", () => {
    let result = applySelectorIntent(selector(), { type: "text", value: "slow" });
    expect(result.state.query).toBe("slow");
    expect(getHighlightedSelectorOption(result.state)?.id).toBe("slow");

    result = applySelectorIntent(result.state, { type: "abort" });
    expect(result.effect).toEqual({ type: "close" });
  });
});

function selector() {
  return createSelectorState({
    source: "model",
    title: "Model",
    options: [
      { id: "fast", label: "Fast", value: "fast", detail: "gpt-fast", keywords: ["cheap"] },
      { id: "slow", label: "Slow", value: "slow", detail: "gpt-slow", keywords: ["quality"] }
    ]
  });
}
