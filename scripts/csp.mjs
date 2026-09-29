import { networkInterfaces } from "node:os";

function originOf(url) {
  if (!url?.trim()) return "";
  try {
    return new URL(url.trim()).origin;
  } catch {
    return "";
  }
}

function toWs(origin) {
  return origin.replace(/^http/, "ws");
}

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

export function lanHosts() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && !entry.internal && entry.family === "IPv4")
    .map((entry) => entry.address);
}

export function buildCsp(env, { dev }) {
  const api = originOf(env.NEXT_PUBLIC_API_BASE_URL) || "http://localhost:4000";
  const supabase = originOf(env.NEXT_PUBLIC_SUPABASE_URL);
  const connect = ["'self'", "ipc:", "http://ipc.localhost", api];
  if (supabase) connect.push(supabase, toWs(supabase));
  const script = ["'self'"];
  if (dev) {
    const hosts = ["localhost", "127.0.0.1", ...lanHosts()].map(formatHost);
    for (const host of hosts) {
      connect.push(`http://${host}:3000`, `ws://${host}:3000`, `http://${host}:4000`);
    }
    script.push("'unsafe-eval'");
  }
  return {
    "default-src": ["'self'"],
    "script-src": script,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": [...new Set(connect)],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
}
