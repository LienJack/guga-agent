#!/usr/bin/env node
import { runCli } from "./commands/run";

const exitCode = await runCli(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  env: process.env
});

process.exitCode = exitCode;
