//after `npx next build`, run `node scripts/csp-hashes.mjs` from watagent-public-ui
//hashes every inline script in out/**/*.html and prints a script-src value
//paste that value into the content-security-policy-report-only header in vercel.json
//next stamps a new build id into those scripts, so the hashes only match that out/
//vercel reads vercel.json before the build, so a header written during `next build` is not what gets served

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(root, process.argv[2] ?? "out");

const EXECUTABLE_TYPE =
  /^(?:module|text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript)$/i;

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (entity, body) => {
    const token = String(body).toLowerCase();
    if (token === "lt") return "<";
    if (token === "gt") return ">";
    if (token === "quot") return '"';
    if (token === "apos") return "'";
    if (token === "amp") return "&";
    const code = token.startsWith("#x") ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return entity;
    return String.fromCodePoint(code);
  });
}

function inlineScripts(html) {
  const found = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const attrs = match[1] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const typeValue = type?.[1] ?? type?.[2] ?? type?.[3] ?? "";
    if (typeValue && !EXECUTABLE_TYPE.test(typeValue)) continue;
    found.push(decodeEntities(match[2] ?? ""));
  }
  return found;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

const files = await htmlFiles(outDir).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`cannot read ${outDir}: ${message}\n`);
  process.exit(1);
});

const hashes = new Set();
let scripts = 0;
for (const file of files.sort()) {
  const html = await readFile(file, "utf8");
  for (const source of inlineScripts(html)) {
    scripts += 1;
    hashes.add(sha256(source));
  }
}

const list = [...hashes].sort();
const scriptSrc = ["'self'", ...list.map((hash) => `'sha256-${hash}'`)].join(" ");
process.stdout.write(`files ${files.length}\nscripts ${scripts}\nunique ${list.length}\n`);
for (const hash of list) process.stdout.write(`sha256-${hash}\n`);
process.stdout.write(`script-src ${scriptSrc}\n`);
