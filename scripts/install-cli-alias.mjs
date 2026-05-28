#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = resolve(root, "packages/cli/dist/index.js");
const shellRc = resolveShellRc(process.argv.slice(2), process.env);
const aliasLine = `alias guga="node ${shellQuote(cliEntry)}"`;
const startMarker = "# >>> guga-agent cli alias >>>";
const endMarker = "# <<< guga-agent cli alias <<<";
const block = `${startMarker}\n${aliasLine}\n${endMarker}`;

if (!existsSync(cliEntry)) {
  console.error(`CLI entry does not exist: ${cliEntry}`);
  console.error("Run `pnpm --filter @guga-agent/cli build` first.");
  process.exitCode = 1;
} else {
  mkdirSync(dirname(shellRc), { recursive: true });
  const existing = existsSync(shellRc) ? readFileSync(shellRc, "utf8") : "";
  const updated = upsertManagedBlock(existing, block, startMarker, endMarker);
  writeFileSync(shellRc, updated);
  console.log(`Installed guga alias in ${shellRc}`);
  console.log(aliasLine);
  console.log(`Run \`source ${shellQuote(shellRc)}\` or open a new terminal, then type \`guga\`.`);
}

function resolveShellRc(args, env) {
  const explicit = readFlag(args, "--shell-rc");
  if (explicit) {
    return resolve(expandHome(explicit));
  }
  const shell = env.SHELL ?? "";
  if (shell.endsWith("/zsh")) {
    return resolve(homedir(), ".zshrc");
  }
  if (shell.endsWith("/bash")) {
    return resolve(homedir(), ".bashrc");
  }
  return resolve(homedir(), ".profile");
}

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
