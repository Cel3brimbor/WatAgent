export const CHAT_IMAGE_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ChatImageMedia = (typeof CHAT_IMAGE_MEDIA)[number];

export const MAX_CHAT_IMAGES = 4;
export const MAX_CHAT_IMAGE_BYTES = 90_000;
export const MAX_CHAT_IMAGE_B64 = 120_000;
export const MAX_CHAT_IMAGE_B64_TOTAL = 480_000;
//keep in sync with MAX_CHAT_IMAGE_TEXT on the api
export const MAX_CHAT_IMAGE_TEXT = 6_000;

export type ChatImage = { mediaType: ChatImageMedia; data: string };

export type PendingChatImage = {
  id: string;
  mediaType: "image/jpeg";
  data: string;
  previewUrl: string;
};

const IMAGE_ERROR = "Use a PNG, JPEG, WEBP, or GIF.";
const LARGE_ERROR = "That image is too large.";
const READ_ERROR = "That image couldn't be read.";
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function latin1(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

function looksLikeImage(bytes: Uint8Array, name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".svg")) return false;
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return false;
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, 180))).trimStart().toLowerCase();
  if (head.startsWith("<") || head.includes("<svg")) return false;
  if (bytes.length >= 12) {
    const brand = latin1(bytes.subarray(8, 12)).toLowerCase();
    if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1") return false;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (head.startsWith("gif87a") || head.startsWith("gif89a")) return true;
  return bytes.length >= 12 && latin1(bytes.subarray(0, 4)) === "RIFF" && latin1(bytes.subarray(8, 12)) === "WEBP";
}

function renderJpeg(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error(READ_ERROR));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(READ_ERROR));
      },
      "image/jpeg",
      quality,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error(READ_ERROR));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error(READ_ERROR));
    reader.readAsDataURL(blob);
  });
}

export async function readChatImage(file: File): Promise<PendingChatImage> {
  const header = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  if (!looksLikeImage(header, file.name)) throw new Error(IMAGE_ERROR);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(READ_ERROR);
  }
  try {
    if (
      bitmap.width < 1 ||
      bitmap.height < 1 ||
      bitmap.width > 8_000 ||
      bitmap.height > 8_000 ||
      bitmap.width * bitmap.height > 24_000_000
    ) {
      throw new Error(LARGE_ERROR);
    }
    let edge = Math.min(1_600, Math.max(bitmap.width, bitmap.height));
    let quality = 0.82;
    let blob = await renderJpeg(bitmap, edge, quality);
    while (blob.size > 70_000 && (quality > 0.5 || edge > 800)) {
      if (quality > 0.5) quality = Math.round((quality - 0.12) * 100) / 100;
      else edge = Math.round(edge * 0.75);
      blob = await renderJpeg(bitmap, edge, quality);
    }
    if (blob.size > MAX_CHAT_IMAGE_BYTES) throw new Error(LARGE_ERROR);
    const data = await blobToBase64(blob);
    if (!BASE64.test(data) || data.length > MAX_CHAT_IMAGE_B64) throw new Error(LARGE_ERROR);
    return {
      id: crypto.randomUUID(),
      mediaType: "image/jpeg",
      data,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}

export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  if (data.files?.length) {
    for (const file of data.files) files.push(file);
  }
  if (files.length === 0) {
    for (const item of data.items ?? []) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export function chatImageSrc(image: { mediaType: string; data: string }): string | null {
  if (!CHAT_IMAGE_MEDIA.includes(image.mediaType as ChatImageMedia)) return null;
  if (!BASE64.test(image.data) || image.data.length > MAX_CHAT_IMAGE_B64) return null;
  return `data:${image.mediaType};base64,${image.data}`;
}
