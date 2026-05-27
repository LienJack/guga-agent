import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@guga-agent/core";
import type { ShellBackend } from "./shell-plugin";
import { createLocalShellBackend, createShellPlugin, filterShellEnvironment, summarizeCommand } from "./shell-plugin";

describe("shell tools", () => {
  it("registers shell_exec as ask-required, interactive, and serial", () => {
    const [tool] = registeredTools("/workspace");

    expect(tool?.name).toBe("shell_exec");
    expect(tool?.runtime).toMatchObject({
      permission: { defaultAction: "ask", profileActions: { headless: "deny" } },
      executionMode: "interactive",
      scheduler: { concurrency: "serial" },
      renderer: { category: "execute" }
    });
  });

  it("executes through a replaceable backend with filtered environment", async () => {
    const execute = vi.fn().mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 });
    const [tool] = registeredTools("/workspace", {
      execute
    });

    await expect(tool!.execute({ command: "echo ok" }, { call: { id: "shell", name: "shell_exec", input: {} } })).resolves.toMatchObject({
      ok: true,
      content: "ok"
    });
    expect(execute).toHaveBeenCalledWith("echo ok", expect.objectContaining({
      cwd: "/workspace",
      env: { PATH: "/bin", HOME: "/home/test" }
    }));
  });

  it("returns structured failures for non-zero exit codes", async () => {
    const [tool] = registeredTools("/workspace", {
      async execute() {
        return { stdout: "", stderr: "nope", exitCode: 2 };
      }
    });

    await expect(tool!.execute({ command: "false" }, { call: { id: "shell", name: "shell_exec", input: {} } })).resolves.toMatchObject({
      ok: false,
      error: { code: "SHELL_COMMAND_FAILED", message: "Shell command exited with code 2" }
    });
  });

  it("returns distinct structured failures for backend timeouts and cancellations", async () => {
    const timeoutTool = registeredTools("/workspace", {
      async execute() {
        return { stdout: "", stderr: "slow", exitCode: 1, reason: "timeout" };
      }
    })[0]!;
    const cancelledTool = registeredTools("/workspace", {
      async execute() {
        return { stdout: "", stderr: "stopped", exitCode: 1, reason: "cancelled" };
      }
    })[0]!;

    await expect(timeoutTool.execute({ command: "sleep 10" }, { call: { id: "shell", name: "shell_exec", input: {} } })).resolves.toMatchObject({
      ok: false,
      error: { code: "SHELL_COMMAND_TIMEOUT" }
    });
    await expect(cancelledTool.execute({ command: "sleep 10" }, { call: { id: "shell", name: "shell_exec", input: {} } })).resolves.toMatchObject({
      ok: false,
      error: { code: "SHELL_COMMAND_CANCELLED" }
    });
  });

  it("normalizes local backend timeout and abort errors", async () => {
    const backend = createLocalShellBackend();
    await expect(backend.execute("sleep 1", { cwd: "/tmp", env: { PATH: "/bin:/usr/bin" }, timeoutMs: 1 })).resolves.toMatchObject({
      reason: "timeout"
    });

    const controller = new AbortController();
    const pending = backend.execute("sleep 1", {
      cwd: "/tmp",
      env: { PATH: "/bin:/usr/bin" },
      timeoutMs: 30_000,
      signal: controller.signal
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({ reason: "cancelled" });
  });

  it("cleans up descendant processes on timeout", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "guga-shell-timeout-"));
    const marker = join(workspace, "late-marker");
    const backend = createLocalShellBackend();
    const command = `${shellQuote(process.execPath)} -e ${shellQuote(
      "setTimeout(() => require('fs').writeFileSync('late-marker', 'late'), 200); setTimeout(() => {}, 5000);"
    )} & wait`;

    try {
      await expect(backend.execute(command, {
        cwd: workspace,
        env: { PATH: process.env.PATH ?? "" },
        timeoutMs: 50
      })).resolves.toMatchObject({ reason: "timeout" });
      await delay(350);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("filters environment variables by allowlist", () => {
    expect(filterShellEnvironment({ PATH: "/bin", SECRET: "no", HOME: "/home" })).toEqual({
      PATH: "/bin",
      HOME: "/home"
    });
  });

  it("summarizes long commands deterministically", () => {
    expect(summarizeCommand(`echo ${"x".repeat(200)}`)).toHaveLength(120);
  });
});

function registeredTools(workspaceRoot: string, backend?: Partial<ShellBackend>): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  createShellPlugin({
    workspaceRoot,
    env: { PATH: "/bin", HOME: "/home/test", SECRET: "no" },
    backend: {
      async execute() {
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      ...backend
    }
  }).init({
    pluginId: "test",
    registerProvider() {},
    registerModel() {},
    registerTool(tool) {
      tools.push(tool);
    },
    registerHook() {}
  });
  return tools;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
