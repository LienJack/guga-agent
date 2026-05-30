import { describe, expect, it } from "vitest";
import type { ToolRuntimeResult } from "@guga-agent/core";
import { createCodeTaskHostRuntime } from "./host-runtime";

describe("code task host runtime adapter", () => {
  it("classifies natural code prompts and emits lifecycle events while completing verified tasks", async () => {
    const runtime = createCodeTaskHostRuntime({
      profileId: "code",
      cwd: "/repo",
      packageScripts: { test: "vitest run" }
    });
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const stageRoles: string[] = [];

    const result = await runtime.start({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      prompt: "implement feature",
      emit(event) {
        events.push(event);
      },
      async runStage(request) {
        stageRoles.push(request.role);
        if (request.role === "planner") {
          return {
            runId: `run-${request.role}`,
            finalAnswer: `\`\`\`code_task_plan
{
  "summary": "Implement feature",
  "files": [{ "path": "src/feature.ts", "action": "modify", "reason": "feature change" }],
  "checks": [{ "command": "pnpm test", "required": true, "reason": "package test" }],
  "assumptions": [],
  "risks": [],
  "ledgerItems": [{ "id": "item-1", "title": "Implement feature", "changedFiles": ["src/feature.ts"], "risks": [] }]
}
\`\`\``
          };
        }
        return {
          runId: `run-${request.role}`,
          finalAnswer: `${request.role} done`
        };
      },
      async invokeTool(options): Promise<ToolRuntimeResult> {
        return {
          call: options.call,
          correlation: {
            runId: options.runId,
            turn: 0,
            toolCallId: options.call.id,
            attempt: 1,
            source: options.source,
            ...(options.taskId ? { taskId: options.taskId } : {})
          },
          result: {
            ok: true,
            content: "ok",
            metadata: { exitCode: 0 }
          }
        };
      }
    });

    expect(runtime.classify({ profileId: "code", prompt: "implement feature", cwd: "/repo" })).toMatchObject({
      shouldCreateTask: true
    });
    expect(stageRoles).toEqual(["scout", "planner", "executor"]);
    expect(result.finalAnswer).toContain("Required verification passed");
    expect(events.find((event) => event.type === "task.phase_changed" && event.plan)).toMatchObject({
      plan: expect.objectContaining({
        ledgerItems: [expect.objectContaining({ id: "item-1", status: "pending" })]
      })
    });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "task.created",
      "task.phase_changed",
      "verification.started",
      "verification.completed",
      "task.completed"
    ]));
    expect(events.find((event) => event.type === "verification.completed")).toMatchObject({
      attempt: expect.objectContaining({
        taskId: "task-1",
        sessionId: "session-1",
        command: "pnpm test",
        status: "passed"
      })
    });
  });
});
