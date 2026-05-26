import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const distDir = process.argv[2] ?? "dist";

await rewriteDirectory(distDir);

async function rewriteDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteDirectory(path);
      continue;
    }
    if (entry.isFile() && extname(entry.name) === ".js") {
      await rewriteFile(path);
    }
  }
}

async function rewriteFile(path) {
  const source = await readFile(path, "utf8");
  const rewritten = source.replace(
    /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (_match, prefix, specifier, suffix) => `${prefix}${withJsExtension(specifier)}${suffix}`
  );

  if (rewritten !== source) {
    await writeFile(path, rewritten, "utf8");
  }
}

function withJsExtension(specifier) {
  const lastSegment = specifier.split("/").at(-1) ?? "";
  return extname(lastSegment) ? specifier : `${specifier}.js`;
}
