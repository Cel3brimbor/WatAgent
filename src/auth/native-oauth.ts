import { invoke } from "@tauri-apps/api/core";

const CODE_RE = /^[A-Za-z0-9._~/+=-]{1,2048}$/;

export async function startNativeOAuth(url: string, callbackScheme: string): Promise<string> {
  const code = await invoke<string>("plugin:oauth|start", { url, callbackScheme });
  if (typeof code !== "string" || !CODE_RE.test(code)) {
    throw new Error("Sign-in did not return a valid code.");
  }
  return code;
}
