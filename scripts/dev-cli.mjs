#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const installIndex = args.indexOf("--install");

if (installIndex === -1) {
  finish(spawn(process.execPath, [
    "--enable-source-maps",
    resolve(root, "packages/cli/dist/index.js"),
    ...args
  ]));
} else {
  const installArgs = [
    ...args.slice(0, installIndex),
    ...args.slice(installIndex + 1)
  ];
  const build = spawn("pnpm", ["--filter", "@guga-agent/cli", "build"]);
  if (build.status === 0) {
    finish(spawn(process.execPath, [resolve(root, "scripts/install-cli-alias.mjs"), ...installArgs]));
  } else {
    finish(build);
  }
}

function spawn(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env
  });
}

function finish(result) {
  if (process.exitCode !== undefined) {
    return;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
  } else {
    process.exitCode = result.status ?? 1;
  }
}
