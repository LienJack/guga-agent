const packages = [
  "core",
  "provider-ai-sdk",
  "plugin-tools-filesystem",
  "plugin-tools-shell",
  "plugin-tools-git"
];

await Promise.all(
  packages.map((name) => import(`../packages/${name}/dist/index.js`))
);

console.log("package esm smoke ok");
