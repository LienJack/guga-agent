#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = resolve(root, "packages/cli/dist/index.js");
const shellRcs = resolveShellRcs(process.argv.slice(2), process.env);
const commandBlock = [
  "guga() {",
  `  (cd ${shellQuote(root)} && pnpm run dev:cli "$@")`,
  "}"
].join("\n");
const startMarker = "# >>> guga-agent cli alias >>>";
const endMarker = "# <<< guga-agent cli alias <<<";
const block = `${startMarker}\n${commandBlock}\n${endMarker}`;

if (!existsSync(cliEntry)) {
  console.error(`CLI entry does not exist: ${cliEntry}`);
  console.error("Run `pnpm --filter @guga-agent/cli build` first.");
  process.exitCode = 1;
} else {
  for (const shellRc of shellRcs) {
    mkdirSync(dirname(shellRc), { recursive: true });
    const existing = existsSync(shellRc) ? readFileSync(shellRc, "utf8") : "";
    const updated = upsertManagedBlock(existing, block, startMarker, endMarker);
    writeFileSync(shellRc, updated);
    console.log(`Installed guga shell function in ${shellRc}`);
  }
  console.log(commandBlock);
  console.log(`Run \`source ${shellQuote(shellRcs[0])}\` or open a new terminal, then type \`guga\`.`);
}

function resolveShellRcs(args, env) {
  const explicit = readFlags(args, "--shell-rc");
  if (explicit.length > 0) {
    return uniquePaths(explicit.map((path) => resolve(expandHome(path))));
  }
  if (args.includes("--current-shell")) {
    return [resolveCurrentShellRc(env)];
  }
  return uniquePaths([
    resolve(homedir(), ".zshrc"),
    resolve(homedir(), ".bashrc"),
    resolve(homedir(), ".profile")
  ]);
}

function resolveCurrentShellRc(env) {
  const shell = env.SHELL ?? "";
  if (shell.endsWith("/zsh")) {
    return resolve(homedir(), ".zshrc");
  }
  if (shell.endsWith("/bash")) {
    return resolve(homedir(), ".bashrc");
  }
  return resolve(homedir(), ".profile");
}

function readFlags(args, flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function expandHome(path) {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

function upsertManagedBlock(existing, block, startMarker, endMarker) {
  const pattern = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`);
  const next = pattern.test(existing)
    ? existing.replace(pattern, block)
    : `${existing.trimEnd()}${existing.trim().length > 0 ? "\n\n" : ""}${block}`;
  return `${next.trimEnd()}\n`;
}

function uniquePaths(paths) {
  return [...new Set(paths)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
