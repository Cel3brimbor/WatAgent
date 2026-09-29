import { isNativeShell } from "@/shared/platform";
import type { AuthDriver, AuthUser } from "@/auth/types";
import { webAuthDriver } from "@/auth/web-session";

let driverPromise: Promise<AuthDriver> | null = null;

function driver(): Promise<AuthDriver> {
  if (!driverPromise) {
    driverPromise = isNativeShell()
      ? import("@/auth/native-session").then((mod) => mod.nativeAuthDriver)
      : Promise.resolve(webAuthDriver);
  }
  return driverPromise;
}

export async function restoreSession(): Promise<AuthUser | null> {
  return (await driver()).restore();
}

export async function getAccessToken(force = false): Promise<string | null> {
  return (await driver()).accessToken(force);
}

export async function signIn(): Promise<AuthUser | null> {
  return (await driver()).signIn();
}

export async function signOut(): Promise<void> {
  await (await driver()).signOut();
}
