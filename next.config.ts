import type { NextConfig } from "next";

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
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["localhost", "127.0.0.1", ...(devHost ? [devHost] : [])],
  webpack: (config, { dev }) => {
    if (!dev) return config;
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/.git/**", "**/node_modules/**", "**/.next/**", "**/src-tauri/**", "**/out/**"],
    };
    return config;
  },
};

export default nextConfig;
