import { describe, expect, it } from "vitest";
import { createInitialWorkbenchState } from "./state";
import { createWorkbenchViewModel } from "./views";

describe("workbench views", () => {
  it("projects startup metadata without renderer types", () => {
    const view = createWorkbenchViewModel(createInitialWorkbenchState({
      projectPath: "/workspace/app",
      sessionId: "session-1",
      branchId: "branch-1",
      profileId: "code",
      providerId: "mock",
      modelId: "guga-mock",
      configSource: "project .guga/config.json",
      slashCommands: ["/new", "/status", "/clear", "/exit"]
    }));

    expect(view.startup).toEqual({
      projectPath: "/workspace/app",
      sessionLabel: "session session-1",
      profileLabel: "code",
      modelLabel: "guga-mock",
      configSourceLabel: "project .guga/config.json",
      slashCommands: ["/new", "/status", "/clear", "/exit"]
    });
    expect(view.statusBar).toMatchObject({
      runStatus: "idle",
      text: "Idle",
      sessionId: "session-1",
      queueLabel: "queue empty",
      usageLabel: "tokens 0 in 0 out 0"
    });
  });
});
