import { spawnSync } from "node:child_process";
import type { NextConfig } from "next";
import path from "node:path";

const ocrAssets = spawnSync(process.execPath, [path.join(__dirname, "scripts/ocr-assets.mjs")], {
  cwd: __dirname,
  stdio: "inherit",
});
if (ocrAssets.status !== 0) throw new Error("OCR assets failed to prepare");

function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function isLoopbackUrl(url: string | undefined): boolean {
  if (!url?.trim()) return true;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return true;
  }
}

const isDev = process.env.NODE_ENV !== "production";
const devHost = process.env.TAURI_DEV_HOST?.trim() || "";

if (isDev && devHost && isLoopbackUrl(process.env.NEXT_PUBLIC_API_BASE_URL)) {
  process.env.NEXT_PUBLIC_API_BASE_URL = `http://${formatHost(devHost)}:4000`;
}

const nextConfig: NextConfig = {
  //monorepo: trace deps from repo root so Next.js doesn't guess from stray lockfiles
  outputFileTracingRoot: path.join(__dirname, ".."),
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["localhost", "127.0.0.1", ...(devHost ? [devHost] : [])],
  webpack: (config, { dev }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      //wasm build only. the full bundle pulls in a larger webgpu runtime.
      "onnxruntime-web": path.join(__dirname, "node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs"),
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    if (!dev) return config;
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/.git/**", "**/node_modules/**", "**/.next/**", "**/src-tauri/**", "**/out/**", "**/public/ort/**", "**/public/ocr/**"],
    };
    return config;
  },
};

export default nextConfig;
