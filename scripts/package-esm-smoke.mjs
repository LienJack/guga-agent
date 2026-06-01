const packages = [
  "core",
  "plugin-session-jsonl",
  "plugin-artifact-filesystem",
  "plugin-replay-audit",
  "plugin-tools-delegation"
];

await Promise.all(
  packages.map((name) => import(`../packages/${name}/dist/index.js`))
);

console.log("package esm smoke ok");
