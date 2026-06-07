import { describe, expect, it } from "vitest";
import { createTestTool } from "../testing/test-tool";
import { projectToolView, toolVisibilityDecision } from "./tool-projection";

describe("tool projection", () => {
  it("creates a capability lease with only visible tools", () => {
    const visible = {
      ...createTestTool({ name: "read_file", content: "ok" }),
      runtime: {
        action: { category: "read" as const, risk: "low" as const },
        source: { kind: "core" as const, namespace: "filesystem" }
      }
    };
    const hidden = {
      ...createTestTool({ name: "hidden_tool", content: "hidden" }),
      runtime: { visibility: "hidden" as const }
    };
    const missingBackend = {
      ...createTestTool({ name: "shell_exec", content: "no" }),
      runtime: {
        availability: { status: "missing-backend" as const, reason: "shell backend missing" }
      }
    };

    const view = projectToolView({
      tools: [visible, hidden, missingBackend],
      runId: "run-projection",
      turn: 2,
      leaseId: "lease-test"
    });

    expect(view.lease).toMatchObject({
      leaseId: "lease-test",
      runId: "run-projection",
      turn: 2,
      visibleToolNames: ["read_file"]
    });
    expect(view.visibleTools.map((tool) => tool.name)).toEqual(["read_file"]);
    expect(view.tools).toEqual([
      expect.objectContaining({
        toolName: "read_file",
        action: { category: "read", risk: "low" },
        source: { kind: "core", namespace: "filesystem" },
        lease: expect.objectContaining({ leaseId: "lease-test" })
      })
    ]);
    expect(view.filtered).toEqual([
      expect.objectContaining({ toolName: "hidden_tool", reason: "hidden" }),
      expect.objectContaining({ toolName: "shell_exec", reason: "missing-backend" })
    ]);
    expect(view.decisions).toHaveLength(3);
  });

  it("filters ask-required tools in headless or background profiles", () => {
    const tool = {
      ...createTestTool({ name: "shell_exec", content: "no" }),
      effect: "execute" as const,
      runtime: {
        permission: { defaultAction: "ask" as const }
      }
    };

    expect(toolVisibilityDecision(tool, { profile: "headless" })).toMatchObject({
      visible: false,
      reason: "policy-denied",
      metadata: { profile: "headless" }
    });
    expect(toolVisibilityDecision(tool, { profile: "trusted-session" })).toMatchObject({
      visible: true,
      reason: "available"
    });
  });

  it("preserves credential and sandbox availability reasons", () => {
    const credentialTool = {
      ...createTestTool({ name: "github_issue_read", content: "no" }),
      runtime: {
        availability: {
          status: "missing-credential" as const,
          reason: "github credential unavailable"
        }
      }
    };
    const sandboxTool = {
      ...createTestTool({ name: "network_scan", content: "no" }),
      runtime: {
        availability: {
          status: "missing-sandbox" as const,
          reason: "restricted network sandbox unavailable"
        }
      }
    };

    expect(projectToolView({ tools: [credentialTool, sandboxTool], leaseId: "lease-env" }).filtered).toEqual([
      expect.objectContaining({
        toolName: "github_issue_read",
        reason: "missing-credential",
        metadata: {
          availability: expect.objectContaining({ reason: "github credential unavailable" })
        }
      }),
      expect.objectContaining({
        toolName: "network_scan",
        reason: "missing-sandbox",
        metadata: {
          availability: expect.objectContaining({ reason: "restricted network sandbox unavailable" })
        }
      })
    ]);
  });
});
