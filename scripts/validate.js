#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const files = ["MMM-CARL.js", "node_helper.js", "config.example.js"];
for (const dir of ["lib", "scripts", "test"]) {
  for (const entry of fs.readdirSync(path.join(root, dir))) {
    if (entry.endsWith(".js")) files.push(`${dir}/${entry}`);
  }
}
for (const file of files) {
  const check = spawnSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
  if (check.error || check.status !== 0) process.exit(1);
}
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
assert.equal(pkg.name, "mmm-carl");
assert.equal(lock.name, pkg.name);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[""].name, pkg.name);
assert.equal(lock.packages[""].version, pkg.version);
assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[""].engines, pkg.engines);
assert.ok(read("MMM-CARL.js").includes('Module.register("MMM-CARL",'));
let examples = 0;
for (const [, body] of read("README.md").matchAll(/```js\n([\s\S]*?)```/g)) {
  const code = body.trim();
  new vm.Script(code.startsWith("{") ? `(${code})` : `({${code}})`);
  examples++;
}
console.log(`Validated ${files.length} JavaScript files, ${examples} README examples, and package/lockfile consistency.`);
