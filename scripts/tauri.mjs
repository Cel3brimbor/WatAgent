import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCsp } from "./csp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  process.stdout.write("No .env.local found; using the default CSP origins.\n");
}

const args = process.argv.slice(2);
const mobile = args[0] === "ios" || args[0] === "android";
const command = mobile ? args[1] : args[0];
const acceptsConfig = command === "dev" || command === "build";

const finalArgs = [...args];
if (acceptsConfig) {
  const override = {
    app: {
      security: {
        csp: buildCsp(process.env, { dev: false }),
        devCsp: buildCsp(process.env, { dev: true }),
      },
    },
  };
  finalArgs.push("--config", JSON.stringify(override));
}

const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const child = spawn(process.execPath, [cli, ...finalArgs], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
