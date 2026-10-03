import { apiJson } from "@/shared/api-base";

function roughChatTitle(user: string, assistant: string): string | null {
  const source = user.trim() || assistant.trim();
  const words = source.replace(/\s+/g, " ").split(" ").filter(Boolean).slice(0, 4).join(" ");
  const title = words.slice(0, 32).trim();
  if (title.length < 2) return null;
  return title.replace(/^\p{Ll}/u, (char) => char.toUpperCase());
}

export async function requestChatTitle(user: string, assistant: string): Promise<string | null> {
  try {
    const payload = await apiJson<{ title?: unknown }>("/api/calendar/chat/title", {
      method: "POST",
      body: JSON.stringify({
        user: user.slice(0, 2000),
        assistant: assistant.slice(0, 2000),
      }),
    });
    const title =
      payload && typeof payload.title === "string" ? payload.title.trim().replace(/\s+/g, " ").slice(0, 40) : "";
    if (title.length >= 2) return title;
  } catch {
    //keep a short label when the naming call fails
  }
  return roughChatTitle(user, assistant);
}
