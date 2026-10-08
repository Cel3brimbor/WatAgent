// Integration check against a real Caddy binary, with disposable fixtures/API.
// Usage: node deploy/check-proxy.mjs /path/to/caddy
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(path.join(tmpdir(), "watagent-proxy-"));
const config = fileURLToPath(new URL("./Caddyfile", import.meta.url));
const api = createServer((req, res) => {
  if (req.url === "/api/failure") {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end('{"error":"unavailable"}');
  } else if (req.url === "/api/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("data: first\n\n");
    setTimeout(() => res.end("data: last\n\n"), 800);
  } else {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": ["session=test; HttpOnly; SameSite=Lax", "other=test; HttpOnly"],
    });
    res.end(JSON.stringify({ url: req.url, headers: req.headers }));
  }
});
let caddy;
let logs = "";
try {
  await mkdir(path.join(root, "product"));
  await mkdir(path.join(root, "_next/static"), { recursive: true });
  await writeFile(path.join(root, "index.html"), "home fixture");
  await writeFile(path.join(root, "product/index.html"), "product fixture");
  await writeFile(path.join(root, "404.html"), "missing fixture");
  await writeFile(path.join(root, "_next/static/app.js"), "/* fixture */");
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  caddy = spawn(process.argv[2] || "caddy", ["run", "--config", config, "--adapter", "caddyfile"], {
    env: { ...process.env, APP_ADDRESS: origin, STATIC_ROOT: root,
      API_UPSTREAM: `127.0.0.1:${api.address().port}`, XDG_DATA_HOME: root, XDG_CONFIG_HOME: root },
    stdio: ["ignore", "pipe", "pipe"],
  });
  caddy.on("error", (error) => { logs += error.message; });
  caddy.stdout.on("data", (chunk) => { logs += chunk; });
  caddy.stderr.on("data", (chunk) => { logs += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(500) })).ok;
      if (ready) break;
    } catch { /* wait for Caddy startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);
  for (const [route, expected] of [["/", "home fixture"], ["/product/", "product fixture"]]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), expected);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-cache");
  }
  for (const route of ["/missing", "/admin", "/internal", "/_next/static/missing.js"]) {
    const missing = await fetch(origin + route);
    assert.equal(missing.status, 404, route);
    assert.equal(missing.headers.get("cache-control"), "no-store", route);
  }
  const asset = await fetch(`${origin}/_next/static/app.js`);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  for (const route of ["/api", "/api/echo?keep=yes"]) {
    const response = await fetch(origin + route, { headers: {
      "X-Real-IP": "203.0.113.9", "X-Watagent-Client-Ip": "203.0.113.8",
      "X-Watagent-Proxy-Secret": "forged", Forwarded: "for=203.0.113.7",
    } });
    assert.equal(response.headers.getSetCookie().length, 2);
    const body = await response.json();
    assert.equal(body.url, route);
    assert.equal(body.headers["x-real-ip"], "127.0.0.1");
    for (const name of ["x-watagent-client-ip", "x-watagent-proxy-secret", "forwarded"]) {
      assert.equal(body.headers[name], undefined, name);
    }
  }
  const failure = await fetch(`${origin}/api/failure`);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: "unavailable" });
  const stream = await fetch(`${origin}/api/stream`, { headers: { "Accept-Encoding": "identity" } });
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.equal(first, "data: first\n\n", "first event must arrive before stream completion");
  while (!(await reader.read()).done) { /* drain */ }
  console.log("Caddy checks passed: routes, 404s, headers, cookies, API errors, streaming, and forged proxy headers.");
} finally {
  if (caddy && caddy.pid && caddy.exitCode === null) {
    const stopped = once(caddy, "exit");
    caddy.kill("SIGTERM");
    await stopped;
  }
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
  await rm(root, { recursive: true, force: true });
}
