import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

//calendar event text stays react children. agent editors that assign markup live outside this tree
const root = dirname(fileURLToPath(import.meta.url));

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...tsxFiles(path));
    else if (name.endsWith(".tsx")) found.push(path);
  }
  return found;
}

const files = tsxFiles(root);
const hits = files.filter((file) => {
  const text = readFileSync(file, "utf8");
  return text.includes("innerHTML") || text.includes("dangerouslySetInnerHTML");
});

assert.deepEqual(
  hits.map((file) => relative(root, file)),
  [],
  "calendar tsx files must not assign innerHTML",
);
console.log(`XSS checks passed: ${files.length} calendar tsx files, no innerHTML.`);
