import { describe, expect, it } from "vitest";
import {
  createFocusState,
  dismissTopFocusTarget,
  pushFocusTarget,
  resolveFocusOwner,
  type FocusTarget
} from "./focus-state";

describe("focus state", () => {
  it("uses the fixed input priority truth table for blocking targets", () => {
    const cases: ReadonlyArray<{
      readonly targets: readonly FocusTarget[];
      readonly expected: FocusTarget["kind"];
    }> = [
      { targets: [{ kind: "prompt" }, { kind: "slash" }], expected: "slash" },
      { targets: [{ kind: "slash" }, { kind: "selector" }], expected: "selector" },
      { targets: [{ kind: "selector" }, { kind: "interaction" }], expected: "interaction" },
      { targets: [{ kind: "interaction" }, { kind: "permission" }], expected: "permission" },
      { targets: [{ kind: "help" }, { kind: "status" }, { kind: "prompt" }], expected: "prompt" },
      {
        targets: [
          { kind: "help" },
          { kind: "prompt" },
          { kind: "slash" },
          { kind: "selector" },
          { kind: "interaction" },
          { kind: "permission" }
        ],
        expected: "permission"
      }
    ];

    for (const testCase of cases) {
      expect(resolveFocusOwner(createFocusState(testCase.targets), "enter")?.kind).toBe(testCase.expected);
    }
  });

  it("lets focused help/status overlays intercept input, while passive overlays stay non-blocking", () => {
    expect(resolveFocusOwner(createFocusState([
      { kind: "help" },
      { kind: "prompt" }
    ]), "enter")?.kind).toBe("prompt");

    expect(resolveFocusOwner(createFocusState([
      { kind: "prompt" },
      { kind: "help", capturesInput: true }
    ]), "enter")?.kind).toBe("help");
  });

  it("dismisses only the top focus target and returns focus to the previous owner", () => {
    let state = createFocusState([{ kind: "prompt" }, { kind: "slash" }, { kind: "selector", id: "model" }]);
    const first = dismissTopFocusTarget(state);

    expect(first.dismissed).toEqual({ kind: "selector", id: "model" });
    expect(resolveFocusOwner(first.state, "enter")?.kind).toBe("slash");

    state = pushFocusTarget(first.state, { kind: "permission", id: "permission-1" });
    const second = dismissTopFocusTarget(state);
    expect(second.dismissed).toEqual({ kind: "permission", id: "permission-1" });
    expect(resolveFocusOwner(second.state, "enter")?.kind).toBe("slash");
  });

  it("keeps pending permission and interaction focus ahead of prompt submit", () => {
    expect(resolveFocusOwner(createFocusState([
      { kind: "prompt" },
      { kind: "interaction", id: "interaction-1" },
      { kind: "permission", id: "permission-1" }
    ]), "enter")).toEqual({ kind: "permission", id: "permission-1" });
  });
});
