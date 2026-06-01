import { describe, expect, it } from "vitest";
import { decideCodeTaskPermission, isSafeVerificationCommand } from "./permission-policy";

describe("code task permission policy", () => {
  it("allows read-only scout tools", () => {
    expect(decideCodeTaskPermission({
      subject: { toolName: "fs_read", effect: "read" },
      call: { id: "call-1", name: "fs_read", input: {} }
    })).toEqual({
      action: "allow",
      reason: "Read-only task discovery tool"
    });
  });

  it("allows safe verification commands only in auto-safe-verification posture", () => {
    const request = {
      subject: { toolName: "shell_exec", effect: "execute" as const },
      call: { id: "call-1", name: "shell_exec", input: { command: "pnpm --filter @guga-agent/core test" } }
    };

    expect(decideCodeTaskPermission(request)).toMatchObject({ action: "ask" });
    expect(decideCodeTaskPermission(request, "auto-safe-verification")).toMatchObject({ action: "allow" });
    expect(isSafeVerificationCommand("pnpm --filter @guga-agent/core test")).toBe(true);
  });

  it("denies destructive shell commands", () => {
    expect(decideCodeTaskPermission({
      subject: { toolName: "shell_exec", effect: "execute" },
      call: { id: "call-1", name: "shell_exec", input: { command: "git reset --hard HEAD" } }
    }, "auto-safe-verification")).toMatchObject({
      action: "deny"
    });
  });
});
