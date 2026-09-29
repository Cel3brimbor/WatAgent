import { isTauri } from "@tauri-apps/api/core";

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isTauri();
  } catch {
    return false;
  }
}
