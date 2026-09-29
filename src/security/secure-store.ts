import { invoke } from "@tauri-apps/api/core";

export async function storeRefreshToken(token: string): Promise<void> {
  await invoke("plugin:secure-store|store_refresh_token", { token });
}

export async function loadRefreshToken(): Promise<string | null> {
  const result = await invoke<{ token?: unknown }>("plugin:secure-store|load_refresh_token");
  return typeof result?.token === "string" && result.token ? result.token : null;
}

export async function clearNativeSession(): Promise<void> {
  await invoke("plugin:secure-store|clear_session");
}
