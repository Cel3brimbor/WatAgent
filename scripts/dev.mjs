import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.resolve(root, "..", "watagent-core-api");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const devHost = process.env.TAURI_DEV_HOST?.trim() || "";

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

const apiEnv = { ...process.env };
if (devHost) {
  apiEnv.LISTEN_HOST = devHost;
  apiEnv.WF_DEV_ORIGIN = `http://${formatHost(devHost)}:3000`;
}

const children = [spawn(npm, ["run", "dev:web"], { cwd: root, stdio: "inherit", env: process.env })];
if (existsSync(path.join(apiRoot, "package.json"))) {
  children.push(spawn(npm, ["run", "dev"], { cwd: apiRoot, stdio: "inherit", env: apiEnv }));
} else {
  process.stdout.write(`No API project at ${apiRoot}; starting the web app only.\n`);
}

let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on("exit", (code) => stop(code ?? 1));
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
