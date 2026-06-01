import { describe, expect, it } from "vitest";
import {
  applySlashPaletteIntent,
  commandNeedsSelector,
  createSlashPaletteState,
  getHighlightedSlashCommand,
  getSlashPaletteItems,
  moveSlashPaletteHighlight,
  updateSlashPaletteQuery
} from "./slash-state";

describe("slash palette state", () => {
  it("filters commands as the slash query changes", () => {
    let state = createSlashPaletteState({ query: "/" });
    expect(getSlashPaletteItems(state).map((command) => command.command)).toContain("/model");

    state = updateSlashPaletteQuery(state, "profile");
    expect(getSlashPaletteItems(state).map((command) => command.command)).toEqual(["/profile"]);

    state = applySlashPaletteIntent(state, { type: "backspace" }).state;
    expect(state.query).toBe("profil");
    expect(getSlashPaletteItems(state).map((command) => command.command)).toEqual(["/profile"]);
  });

  it("moves the highlighted command with navigation intents without changing the query", () => {
    let state = createSlashPaletteState({ query: "model" });
    const initialQuery = state.query;
    const initialCommand = getHighlightedSlashCommand(state)?.command;

    state = moveSlashPaletteHighlight(state, 1);

    expect(state.query).toBe(initialQuery);
    expect(getHighlightedSlashCommand(state)?.command).not.toBe(initialCommand);
  });

  it("selects commands and exposes selector requirements for parameter-heavy commands", () => {
    const state = createSlashPaletteState({ query: "switch model" });
    const result = applySlashPaletteIntent(state, { type: "submit" });

    expect(result.effect).toMatchObject({
      type: "select",
      command: {
        command: "/model",
        selector: "model"
      }
    });
    if (result.effect?.type !== "select") {
      throw new Error("Expected slash select effect");
    }
    expect(commandNeedsSelector(result.effect.command)).toBe(true);
  });

  it("closes on escape without producing a prompt edit", () => {
    const result = applySlashPaletteIntent(createSlashPaletteState({ query: "status" }), { type: "abort" });

    expect(result.state.isOpen).toBe(false);
    expect(result.effect).toEqual({ type: "close" });
  });
});
